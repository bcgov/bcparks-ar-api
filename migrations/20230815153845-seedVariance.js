'use strict';
const AWS = require('aws-sdk');
const { getParks, getSubAreas, getOne, TABLE_NAME, dynamodb } = require('../lambda/dynamoUtil');
const { calculateVariance } = require('../lambda/varianceUtils');
const { updateConsoleProgress, finishConsoleUpdates, errorConsoleUpdates } = require('../tools/progress-indicator');
const { EXPORT_VARIANCE_CONFIG } = require('../lambda/constants');
const { DateTime } = require('luxon');

const MAX_TRANSACTION_SIZE = 25;

/*
This migration will seed the database with variance records for activities recorded between 2023-01-01 and present. 
Most of the variance checking/creating code is copied from Activity PUT - it was not imported directly because
  1. some minor changes in function outputs were necessary to convert variance create into a batch function.
  2. I did not want to edit the existing Activity PUT script for fear of changing the behaviour of already-functional code.
*/

async function run() {
  // get a list of variances to be created
  const variances = await getVariances();
  // create and put variances in the DB.
  if (variances.length) {
    await putVariances(variances);
  } else {
    console.log('No variances to create. Exiting migration');
  }
  // complete.
}

// imported from Activity POST
async function getVariances() {
  let startTime = new Date();
  let recordCount = 0;
  let variances = [];

  // get a list of variances to be created
  console.log('Getting a list of variances to create.');
  // get all parks
  try {
    const parks = await getParks();
    for (const park of parks) {
      // for each park, get all subareas
      const subareas = await getSubAreas(park.orcs);
      for (const subarea of subareas) {
        // for each subarea, get all activities
        const activities = subarea.activities?.values;
        for (const activity of activities) {
          // for each activity, get the 2023 year's worth of records
          const currentDate = DateTime.now();
          const year = currentDate.year;
          const month = currentDate.month
          for (let i = 1; i <= month; i++) {
            // for the year, get each month's specific record for variance check.
            // Don't yell at me for my quadruply nested for loop
            const month = year + String(i).padStart(2, '0');
            const record = await getOne(`${subarea.sk}::${activity}`, `${month}`);
            if (Object.keys(record).length > 0) {
              recordCount++;
              const variance = await checkVarianceTrigger(record);
              if (variance) {
                variances.push(variance);
              }
              updateConsoleProgress(startTime, `Variances to be created: ${variances.length}. Records analysed`, 25, recordCount);
            }
          }
        }
      }
    }
    // variance record collection was successful
    finishConsoleUpdates();
    console.log('Records analysed:', recordCount);
    console.log('Variances to be created:', variances.length);
    return variances;
  } catch (error) {
    errorConsoleUpdates(error);
  }
  return [];
}


async function putVariances(records) {
  // create variances and put them in the DB
  let failures = [];
  let successes = [];
  let count = 0;
  let batchChunk = { RequestItems: {[TABLE_NAME]: [] }};
  const startTime = new Date();
  for (const record of records) {
    try {
      // check if a variance record already exists. If so, we don't want to overwrite it.
      // We do this check here instead of in a transactWrite because finding an existing
      // record in a transactWrite will cause the whole transaction to fail.
      const existing = await getOne(`variance::${record.orcs}::${record.date}`, `${record.subAreaId}::${record.activity}`)
      if (Object.keys(existing) > 0) {
        // variance record exists.
        continue;
      }
      // we have to staple the bundle on...
      let subarea = getOne(`park::${records.orcs}`, record.subAreaId);
      let bundle = subarea?.bundle;
      if (bundle === undefined) {
        bundle = 'N/A';
      }
      // create new variance object
      const newVariance = {
        pk: `variance::${record.orcs}::${record.date}`,
        sk: `${record.subAreaId}::${record.activity}`,
        fields: record?.fields || [],
        notes: record?.notes || '',
        resolved: false,
        orcs: record.orcs,
        parkName: record.parkName,
        subAreaId: record.subAreaId,
        subAreaName: record.subAreaName,
        bundle: bundle,
        roles: ['sysadmin', `${record.orcs}:${record.subAreaId}`]
      }
      // convert and append to transaction
      batchChunk.RequestItems[TABLE_NAME].push({
        PutRequest: {
          Item: AWS.DynamoDB.Converter.marshall(newVariance),
        }
      })
      count++;
      updateConsoleProgress(startTime, `Successes: ${successes.length}. Processed`, 10, count, records.length);
      // DynamoDB PUT. Note: batchWriteItems is lightweight since we've already done our conditional check
      if (batchChunk.RequestItems[TABLE_NAME].length > 24 || count >= records.length) {
        await dynamodb.batchWriteItem(batchChunk).promise();
        successes = successes.concat(batchChunk.RequestItems[TABLE_NAME]);
        batchChunk = { RequestItems: {[TABLE_NAME]: [] }};
      }
    } catch (error) {
      errorConsoleUpdates(error);
      failures = failures.concat(batchChunk.RequestItems[TABLE_NAME]);
      batchChunk = { RequestItems: {[TABLE_NAME]: [] }};
    }
  }
  // variance record creation was successful
  finishConsoleUpdates();
  console.log('Successes:', successes.length);
  console.log('Failures:', failures.length);
}

async function checkVarianceTrigger(body) {
  const subAreaId = body.subAreaId;
  const activity = body.activity;
  const date = body.date;
  const notes = body.notes;
  const orcs = body.orcs;
  const subAreaName = body.subAreaName;
  const parkName = body.parkName;

  // Create a variance field array
  let fields = [];
  let varianceWasTriggered = false;

  // Map through all fields we care about and check their values
  let varianceConfig = EXPORT_VARIANCE_CONFIG[activity];
  const fieldsToCheck = Object.keys(varianceConfig);

  // Pull up to the last 3 years for this activity type and date.
  let records = await getPreviousYearData(3, subAreaId, activity, date);

  if (records.length > 0) {
    for (const field in fieldsToCheck) {
      let current = body?.[fieldsToCheck[field]];
      let first = records[0]?.[fieldsToCheck[field]];
      let second = records[1]?.[fieldsToCheck[field]];
      let third = records[2]?.[fieldsToCheck[field]];

      if (!current === undefined || !first === undefined) {
        // We skip comparing against fields that are undefined. TBD Business logic.
        // Move onto the next field
        continue;
      }

      const res = calculateVariance([first, second, third], current, varianceConfig[fieldsToCheck[field]]);
      if (res.varianceTriggered) {
        varianceWasTriggered = true;
        fields.push({ key: fieldsToCheck[field], percentageChange: res?.percentageChange });
      }
    }
  }

  // Create variance object if variance was triggered or if a variance note exists
  if (varianceWasTriggered || (notes !== '' && notes !== undefined && notes !== null)) {
    return {
      orcs: orcs,
      date: date,
      subAreaId: subAreaId,
      activity: activity,
      fields: fields,
      notes: notes,
      parkName: parkName,
      subAreaName: subAreaName
    }
  }
  return null;
}

async function getPreviousYearData(years, subAreaId, activity, date) {
  // Get records for up to the past N years, limited to no farther than January 2022
  let currentDate = DateTime.fromFormat(date, 'yyyyMM');
  const targetYear = 202201;
  let records = [];

  // Go back 3 years until no more than 2022
  for (let i = 1; i <= years; i++) {
    let selectedYear = currentDate.minus({ years: i }).toFormat('yyyyMM');
    if (selectedYear >= targetYear) {
      try {
        const data = await getOne(`${subAreaId}::${activity}`, selectedYear);
        if (Object.keys(data).length !== 0) {
          records.push(data);
        }
      } catch (err) {
        // Skip on errors
      }
    }
  }

  return records;
}

run();
