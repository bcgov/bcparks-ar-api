const axios = require('axios');
const { runQuery,
  runScan,
  NAME_CACHE_TABLE_NAME,
  TABLE_NAME,
  ORCS_INDEX,
  dynamoClient,
  PutItemCommand,
  BatchWriteItemCommand,
  UpdateItemCommand,
  marshall,
  logger
} = require("/opt/baseLayer");
const DATA_REGISTER_NAME_ENDPOINT = process.env.DATA_REGISTER_NAME_ENDPOINT || 'https://zloys5cfvf.execute-api.ca-central-1.amazonaws.com/api/parks/names?status=established';
const DATA_REGISTER_NAME_API_KEY = process.env.DATA_REGISTER_NAME_API_KEY;
const ESTABLISHED_STATE = 'established';

exports.handler = async (event, context) => {
  logger.info('Name Update')
  logger.debug(event, context);

  try {
    // Get list of park names from the data register
    const response = await getDataRegisterRecords();
    const dataRegisterRecords = response.data?.data?.items;
    logger.info("Data Register records size:", dataRegisterRecords.length);

    // Get last cached list, if any, from our DB
    const cachedRecords = await getCachedData();
    if (cachedRecords.length === 0) {
      logger.info("No cached data");

      // Get a list of records where attributes orcs/parkName are present on a per-record basis.
      logger.debug(dataRegisterRecords)
      await updateAllRecords(dataRegisterRecords);

      // Store the cache for next time.
      logger.info("Storing data register records in the cache.");
      await batchWriteCache(dataRegisterRecords);

      return {};
    }
    logger.info("Cached data found.", cachedRecords.length);

    // Start the process of determining which records have changed since last time we called this.
    // Compare against the last time we check, and determine if there are any name changes required.
    const { differences, newItems } = compareArraysByDisplayName(cachedRecords, dataRegisterRecords);

    if (differences.length > 0) {
      logger.info(`Differences found in property 'displayName'`);
      for(const rec of differences) {
        logger.debug(rec);
        const foundObject = dataRegisterRecords.find(item => item.pk === rec.pk);
        logger.debug(foundObject);

        // Update all records that match this found object in the DR
        await updateAllRecords([foundObject]);

        // Update the local cache now that we have updated the records related to it
        await updateLocalCache(foundObject);

        // TODO: What to do when the dataRegister record is repealed?
      }
    } else {
      logger.info(`No differences found in property 'displayName'.`);
    }

    // Simply just put them into our cache.
    if (newItems.length > 0) {
      logger.info(`New items found`);
      for (const rec of newItems) {
        logger.debug(rec);
        const foundObject = dataRegisterRecords.find(item => item.pk === rec.pk);
        logger.debug(foundObject);

        // Update our local cache with the difference and new items.
        await updateLocalCache(foundObject);
      }
    } else {
      logger.info(`No new items found in data register.`);
    }
  } catch (err) {
    logger.error(JSON.stringify(err));
  }
  return {};
};

async function updateLocalCache(item) {
  logger.info("Updating local cache");
  logger.debug(item);
  const putItem = {
    TableName: NAME_CACHE_TABLE_NAME,
    Item: marshall(item, { removeUndefinedValues: true })
  };
  await dynamoClient.send(new PutItemCommand(putItem));
  logger.info("Update complete")
}

async function batchWriteCache(records) {
  logger.info(`writing ${Math.ceil(records.length/25)} batches for ${records.length} records`);
  let batchCount = 0;
  // Writes the records in batches of 25
  let batch = { RequestItems: { [NAME_CACHE_TABLE_NAME]: [] } };
  for(const record of records) {
    logger.info("Writing cache");
    logger.debug(record)
    // logger.info(`Processing record:`, record)
    batch.RequestItems[NAME_CACHE_TABLE_NAME].push({
      PutRequest: {
        Item: marshall(record, { removeUndefinedValues: true })
      }
    });
    // Check if we should write the batch
    if (batch.RequestItems[NAME_CACHE_TABLE_NAME].length === 25) {
      batchCount++;
      // Write the current batch and reset the batch
      await dynamoClient.send(new BatchWriteItemCommand(batch));
      process.stdout.write(`.`);
      batch.RequestItems[NAME_CACHE_TABLE_NAME] = [];
    }
  }

  // Write out any remaining batch items.
  if (batch.RequestItems[NAME_CACHE_TABLE_NAME].length > 0) {
    batchCount++;
    logger.info(`writing final batch #${batchCount}`);
    await dynamoClient.send(new BatchWriteItemCommand(batch));
    logger.info(`Complete.`);
  }
}

async function updateAllRecords(records) {
  logger.info(`Processing ${records.length} data register records.`)
  // Pre-setup the update object.
  let updateObj = {
    TableName: TABLE_NAME,
    Key: {
      pk: { S: '' }, // Prefix with leading zeros for this system later
      sk: { S: '' },
    },
    UpdateExpression: 'set parkName =:parkName',
    ExpressionAttributeValues: {
      ':parkName': { S: '' }
    },
    ReturnValues: 'NONE',
  };
  for(const record of records) {
    logger.info("----------------------");
    logger.debug(JSON.stringify(record));
    updateObj.ExpressionAttributeValues[':parkName'].S = record.displayName;
    // Each record is a seperate protected area in the data register.  The difference currently with
    // A&R is that there are 0 prefixes on numbers in 4 digits.
    const pk = String(record.pk).padStart(4, '0');
    logger.info(`Getting indexed record set for:${pk}`);
    const recordsToUpdate = await getIndexedRecordSet(pk);
    logger.debug(JSON.stringify(recordsToUpdate));
    logger.info(`Size: ${recordsToUpdate.length}`);
    if (recordsToUpdate.length > 0) {
      process.stdout.write(`Orcs: ${pk} (${recordsToUpdate.length} records)`);
      // Update all the records
      await updateRecords(recordsToUpdate, updateObj);
    }
  }
}

async function updateRecords(recordsToUpdate, updateObj) {
  for(const record of recordsToUpdate) {
    let params = JSON.parse(JSON.stringify(updateObj))
    params.Key.pk.S = record.pk;
    params.Key.sk.S = record.sk;

    try {
      process.stdout.write(`.`);
      await dynamoClient.send(new UpdateItemCommand(params));
    } catch (e) {
      logger.info(e);
      // TODO: Fall through, but record error somehow?
    }
  }
  logger.info(); // New line
}

async function getIndexedRecordSet(id) {
  const queryObj = {
    TableName: TABLE_NAME,
    IndexName: ORCS_INDEX,
    ExpressionAttributeValues: {
      ':orcs': { S: id }
    },
    KeyConditionExpression: 'orcs =:orcs',
  };

  try {
    return await runQuery(queryObj);
  } catch (e) {
    logger.error(e);
    logger.error(JSON.stringify(e));
    return [];
  }
}

async function getCachedData() {
  const queryObj = {
    TableName: NAME_CACHE_TABLE_NAME
  };

  try {
    return await runScan(queryObj);
  } catch (e) {
    logger.error(e)
    logger.error(JSON.stringify(e));
    return [];
  }
}

async function getDataRegisterRecords() {
  return await axios.get(encodeURI(DATA_REGISTER_NAME_ENDPOINT),
    {
      params: {
        status: ESTABLISHED_STATE
      },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'None',
        'Accept': 'application/json',
        'x-api-key': DATA_REGISTER_NAME_API_KEY
      }
    });
}

// Function to compare two arrays of objects by the displayName property (matching on pk)
function compareArraysByDisplayName(arr1, arr2) {
  const differences = [];
  const newItems = [];

  // Iterate through arr1 and compare with items in arr2
  for (let i = 0; i < arr1.length; i++) {
    const item1 = arr1[i];
    const item2 = arr2.find(item => item.pk === item1.pk);

    if (item2 && item1.displayName !== item2.displayName) {
      differences.push({
        pk: item1.pk,
        displayName: {
          oldValue: item1.displayName,
          newValue: item2.displayName
        }
      });
    }
  }

  // Find items in arr2 that are not in arr1 and add them to newItems
  for (let i = 0; i < arr2.length; i++) {
    const item2 = arr2[i];
    const item1 = arr1.find(item => item.pk === item2.pk);

    if (!item1) {
      newItems.push({
        pk: item2.pk,
        displayName: item2.displayName
      });
    }
  }

  return {
    differences,
    newItems
  };
}

