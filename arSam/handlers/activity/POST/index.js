const { DateTime } = require('luxon');
const { 
  dynamoClient,
  PutItemCommand,
  DeleteItemCommand,
  UpdateItemCommand,
  runQuery,
  TABLE_NAME,
  getOne,
  FISCAL_YEAR_FINAL_MONTH,
  TIMEZONE,
  sendResponse,
  logger,
  calculateVariance,
  marshall,
  unmarshall,
} = require('/opt/baseLayer');
const { EXPORT_VARIANCE_CONFIG } = require('/opt/constantsLayer');

exports.handlePost = async (event, context) => {
  logger.info('Activity POST:');
  return await main(event, context);
};

exports.handleLock = async (event, context) => {
  logger.debug('Record Lock POST:', event);
  return await main(event, context, true);
};

exports.handleUnlock = async (event, context) => {
  logger.debug('Record Unlock POST:', event);
  return await main(event, context, false);
};

async function main(event, context, lock = null) {
  try {

    const warnIfVariance = event.queryStringParameters?.hasOwnProperty('warn') || false;
    let permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject.roles);
       
    if (!permissionObject.isAuthenticated) {
      logger.info("**NOT AUTHENTICATED, PUBLIC**");
      return sendResponse(403, { msg: "Error: UnAuthenticated." }, context);
    }

    const body = JSON.parse(event.body);

    if (!permissionObject.isAdmin && permissionObject.roles.includes(`${body.orcs}:${body.subAreaId}`) === false) {
      logger.info('Not authorized.');
      logger.debug(permissionObject.roles);
      return sendResponse(403, { msg: 'Unauthorized.' }, context);
    }

    if (await verifyBody(body)) {
      logger.info('Fiscal year is locked.');
      logger.debug('verifyBody', body);
      return sendResponse(400, { msg: 'Invalid request.' });
    }

    // check if fiscal year is locked
    if (await checkFiscalYearLock(body)) {
      logger.debug('checkFiscalYearLock', body);
      return sendResponse(
        403,
        {
          msg: `This fiscal year has been locked against editing by the system administrator.`,
        },
        context
      );
    }

    // Disabling the ability to change config for now.
    // Request used to necessitate 'type = activity/config' as a queryParam (was future proofing).
    // Queryparams no longer required. All info included in request body.
    // Refer to code prior to 2022-09-27 for handleConfig.

    // check if attempting to lock current/future month
    // Not allowed as per https://bcparksdigital.atlassian.net/browse/BRS-817
    if (lock && (await checkLockingDates(body))) {
      logger.debug('checkLockingDates', body);
      return sendResponse(403, { msg: 'Cannot lock a record for a month that has not yet concluded.' }, context);
    }

    // check if record is locked
    const unlocking = lock === false ? true : false;
    const existingRecord = await getOne(`${body.subAreaId}::${body.activity}`, body.date);
    if (existingRecord?.isLocked && !unlocking) {
      logger.info('Record is locked.');
      logger.debug('locking', existingRecord?.isLocked, !unlocking);
      return sendResponse(409, { msg: 'Record is locked.' });
    }

    // handle locking/unlocking existing records
    if (lock !== null) {
      if (existingRecord?.pk) {
        return await handleLockUnlock(existingRecord, lock, context);
      } else if (lock === false) {
        // if record doesnt exist, we can't unlock it
        logger.info('Record not found.');
        return sendResponse(404, { msg: 'Record not found.' });
      }
      // if we are locking a record that doesn't exist, we need to create it.
      // fall through and create new record for locking.
      lock = true;
    }

    // Check variance. If 'warn', and no notes, return the variance without saving it and don't update the activity.
    const fields = await checkVarianceTrigger(body);
    const notesOverride = Boolean(body.notes);
    if (warnIfVariance && fields.length && !notesOverride) {
      return sendResponse(200, { msg: 'Variance triggered, nothing saved.', fields: fields, varianceWarning: true }, context);
    } else {
      // Create variance object if variance was triggered or if a variance note exists
      if (fields.length || body?.notes) {
        await createVariance(body, fields);
      } else {
        await deleteVariance(body);
      }
      return await handleActivity(body, lock, context);
    }
  } catch (err) {
    logger.error(err);
    return sendResponse(400, { msg: 'Invalid request' }, context);
  }
}

async function deleteVariance(body) {
  const params = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: `variance::${body?.orcs}::${body?.date}` },
      sk: { S: `${body?.subAreaId}::${body?.activity}` },
    },
  };

  logger.info('Deleting variance record:', params);

  await dynamoClient.send(new DeleteItemCommand(params));
}

async function checkVarianceTrigger(body) {
  const subAreaId = body?.subAreaId;
  const activity = body?.activity;
  const date = body?.date;

  // Create a variance field array
  let fields = [];
  let varianceWasTriggered = false;

  // Map through all fields we care about and check their values
  let varianceConfig = EXPORT_VARIANCE_CONFIG[activity];
  const fieldsToCheck = Object.keys(varianceConfig);

  logger.info(`Fields to check: ${fieldsToCheck}`);

  // Pull up to the last 3 years for this activity type and date.
  let records = await getPreviousYearData(3, subAreaId, activity, date);
  if (records.length > 0) {
    for (const field in fieldsToCheck) {
      logger.info(`Checking ${fieldsToCheck[field]}`);
      let current = body?.[fieldsToCheck[field]];
      let first = records[0]?.[fieldsToCheck[field]];
      let second = records[1]?.[fieldsToCheck[field]];
      let third = records[2]?.[fieldsToCheck[field]];

      // Build the yearly averages object
      let yearlyAverages = {};
      for (let i = 0; i <= 2; i++) {
        if (records[i]?.sk) {
          yearlyAverages[records[i]?.sk.slice(0, 4)] = records[i]?.[fieldsToCheck[field]];
        }
      }

      // Grabs the field percentage from the object
      logger.info(
        `Calculating variance ${first}, ${second}, ${third}, ${current}, ${varianceConfig[fieldsToCheck[field]]}`
      );

      if (!current === undefined || !first === undefined) {
        // We skip comparing against fields that are undefined. TBD Business logic.
        // Move onto the next field
        logger.info('Undefined field - skipping.');
        continue;
      }

      const res = calculateVariance([first, second, third], current, varianceConfig[fieldsToCheck[field]]);
      if (res.varianceTriggered) {
        varianceWasTriggered = true;
        fields.push({
          key: fieldsToCheck[field],
          percentageChange: res?.percentageChange,
          historicalAverage: res?.averageHistoricValue,
          yearlyAverages: yearlyAverages
        });
      }
    }
    // By now, the varianceWasTriggered should be active and the fields array full
    // of the specific fields that triggers.  Or, there is no variance at all.
    logger.info('Variance triggered: ', varianceWasTriggered);
    logger.info(fields);
  }

  return fields;

}

async function createVariance(body, fields) {
  // TODO: Include bundle property on the config object and use that to get the
  // bundle for variance.
  let subarea = await getOne(`park::${body?.orcs}`, body?.subAreaId);
  let bundle = subarea?.bundle;
  if (bundle === undefined) {
    bundle = 'N/A';
  }
  logger.info('Creating Variance:', JSON.stringify(body));
  try {
    const newObject = marshall({
      pk: `variance::${body?.orcs}::${body?.date}`,
      sk: `${body?.subAreaId}::${body?.activity}`,
      fields: fields,
      notes: body?.notes,
      resolved: false,
      orcs: body?.orcs,
      parkName: body?.parkName,
      subAreaName: body?.subAreaName,
      subAreaId: body?.subAreaId,
      bundle: bundle,
      roles: ['sysadmin', `${body?.orcs}:${body?.subAreaId}`],
    }, { removeUndefinedValues: true });
    const putObj = {
      TableName: TABLE_NAME,
      Item: newObject,
    };
    await dynamoClient.send(new PutItemCommand(putObj));
  } catch (e) {
    logger.error(e);
  }
}

async function getPreviousYearData(years, subAreaId, activity, date) {
  logger.info('Getting previous year data', years, subAreaId, activity, date);
  // Get records for up to the past N years, limited to no farther than January 2022
  let currentDate = DateTime.fromFormat(date, 'yyyyMM');
  const targetYear = 202201;
  let records = [];

  // Go back 3 years until no more than 2022
  for (let i = 1; i <= years; i++) {
    let selectedYear = currentDate.minus({ years: i }).toFormat('yyyyMM');
    if (selectedYear >= targetYear) {
      logger.info(`Selected year: ${selectedYear}`);
      try {
        const data = await getOne(`${subAreaId}::${activity}`, selectedYear);
        logger.info('Read Activity Record Returning.');
        logger.debug('DATA:', data);
        if (Object.keys(data).length !== 0) {
          records.push(data);
        }
      } catch (err) {
        // Skip on errors
        logger.error(err);
      }
    }
  }

  return records;
}

async function checkFiscalYearLock(body) {
  // extract fiscal year from date
  let recordYear = Number(body.date.slice(0, 4));
  let recordMonth = Number(body.date.slice(4, 6));
  if (recordMonth > FISCAL_YEAR_FINAL_MONTH) {
    recordYear++;
  }
  const fiscalYearEndObj = await getOne('fiscalYearEnd', String(recordYear));
  if (fiscalYearEndObj?.isLocked) {
    return true;
  }
  return false;
}

async function checkLockingDates(body) {
  const beginningOfMonth = DateTime.now().setZone(TIMEZONE).startOf('month');
  const recordDate = DateTime.fromObject(
    {
      year: Number(body.date.slice(0, 4)),
      month: Number(body.date.slice(4, 6)),
    },
    {
      zone: TIMEZONE,
    }
  );
  if (recordDate >= beginningOfMonth) {
    return true;
  }
  return false;
}

async function verifyBody(body) {
  if (!body.subAreaId || !body.activity || !body.date) {
    return true;
  }
  // delete isLocked - need correct path to lock/unlock records
  delete body.isLocked;
  return false;
}

async function handleLockUnlock(record, lock, context) {
  const updateObj = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: record.pk },
      sk: { S: record.sk },
    },
    UpdateExpression: 'set isLocked = :isLocked',
    ConditionExpression: 'isLocked <> :isLocked',
    ExpressionAttributeValues: {
      ':isLocked': { BOOL: lock },
    },
    ReturnValues: 'ALL_NEW',
  };
  try {
    const res = await dynamoClient.send(new UpdateItemCommand(updateObj));
    logger.info(`Updated record pk: ${record.pk}, sk: ${record.sk} `);
    const s = lock ? 'locked' : 'unlocked';
    return sendResponse(200, {
      msg: `Record successfully ${s}`,
      data: unmarshall(res.Attributes),
    });
  } catch (err) {
    if (err.code === 'ConditionalCheckFailedException') {
      return sendResponse(409, {
        msg: 'Record is already locked/unlocked',
        error: err,
      });
    }
    return sendResponse(400, {
      msg: 'Record lock/unlock failed: ',
      error: err,
    });
  }
}

async function handleActivity(body, lock = false, context) {
  // Set pk/sk
  try {
    const pk = `${body?.subAreaId}::${body?.activity}`;

    // Get config to attach to activity
    const configObj = {
      TableName: TABLE_NAME,
      ExpressionAttributeValues: {
        ':pk': { S: `config::${body?.subAreaId}` },
        ':sk': { S: body?.activity },
      },
      KeyConditionExpression: 'pk =:pk AND sk =:sk',
    };
    const configData = (await runQuery(configObj))[0];
    if (!configData?.orcs || !configData?.parkName) {
      throw 'Malformed config object';
    }
    body['config'] = configData;
    body['orcs'] = body['orcs'] ? body['orcs'] : configData.orcs;
    body['parkName'] = body['parkName'] ? body['parkName'] : configData.parkName;
    body['subAreaName'] = body['subAreaName'] ? body['subAreaName'] : configData.subAreaName;

    body['pk'] = pk;

    if (body.date.length !== 6 || isNaN(body.date)) {
      throw 'Invalid date.';
    }

    body['sk'] = body.date;
    body['lastUpdated'] = new Date().toISOString();

    body['isLocked'] = lock ?? false;

    const newObject = marshall(body, {removeUndefinedValues: true});

    let putObject = {
      TableName: TABLE_NAME,
      Item: newObject,
    };

    await dynamoClient.send(new PutItemCommand(putObject));
    logger.info('Activity Updated.');
    return sendResponse(200, body, context);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
}
