const { DateTime } = require('luxon');
const { getParks, TABLE_NAME, getOne, runQuery, dynamodb, batchPut } = require('../lambda/dynamoUtil');
const { updateConsoleProgress, errorConsoleUpdates, finishConsoleUpdates } = require('../tools/progress-indicator');

const tz = 'America/Vancouver';
// Start from the year 2000
const minDate = DateTime.now().set({
  year: 2022,
  month: 1,
  day: 1,
}).setZone(tz);

/*
This migration is for PDR-322: https://github.com/bcgov/bcparks-ar-admin/issues/322.
It adds the missing fields 'historicalAverage' and 'yearlyAverages' to existing variance objects.
We have to cycle through all variances which is a lengthy process since there could be 1 variance object per activity record in the database.
Once we have all the variances, we need to check if they need the field to be added.
If so, we overwrite the existing variance report with the correct fields.
This will involve pulling the last 3 years of the variance and figuring out what the actual values are
*/

async function run() {
  // Get all activity records
  try {
    const parks = await getParks();
    const overallTimeStart = new Date();
    let fixedCounter = 0;
    let failures = [];
    for (const park of parks) {
      updateConsoleProgress(overallTimeStart, `Park ${park.parkName}`, 1, parks.indexOf(park), parks.length);
      process.stdout.write('\n');
      let currentDate = minDate;
      let maxDate = DateTime.now().setZone(tz);
      let variances = [];
      const getVarianceTimeStart = new Date();
      do {
        // check for existing variances
        updateConsoleProgress(getVarianceTimeStart, `\tCollecting ${park.parkName} variances`, 1, variances.length);
        const varianceGet = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: {
            ':pk': { S: `variance::${park.orcs}::${currentDate.toFormat('yyyyLL')}` }
          }
        };
        const variance = await runQuery(varianceGet);
        // continue if no variance
        if (variance.length > 0) {
          variances = variances.concat(variance);
        }
        currentDate = currentDate.plus({ months: 1 });
      } while (currentDate < maxDate);
      process.stdout.write('\n');

      // Do stuff if we've got variances to work with
      if (variances.length > 0) {
        // eliminate variances that have no field updates
        const filteredVariances = variances.filter((v) => v?.fields?.length > 0);
        const fixVarianceTimeStart = new Date();
        for (const variance of filteredVariances) {
          updateConsoleProgress(fixVarianceTimeStart, `\tFixing ${park.parkName} variances`, 1, filteredVariances.indexOf(variance), filteredVariances.length);
          // If the variance fields dont have a historical average, we have to fix it.
          if (variance?.fields?.length && !variance?.fields?.[0]?.historicalAverage) {
            try {
              await remakeVariance(variance);
              fixedCounter++;
            } catch (error) {
              console.log('error:', error);
              failures.push(variance);
            }
          }
        }
        process.stdout.write('\n');
        //batchWrite variances
        await batchPut(filteredVariances);
      }
    }
    finishConsoleUpdates();
    console.log('Variances updated:', fixedCounter);
  } catch (error) {
    errorConsoleUpdates(error);
  }
}

async function remakeVariance(variance) {
  // iterate through fields
  try {
    const activity = variance?.sk.split('::')[1];
    const subAreaId = variance?.subAreaId;
    const date = variance?.pk.split('::')[2];
    // get last 3 years of variances
    const records = await getPreviousYearData(3, subAreaId, activity, date);
    let fields = [];
    for (const field of variance.fields) {
      let ha = buildHistoricalAverage(field.key, records);
      if (ha) {
        field['historicalAverage'] = ha;
      }
      let ya = buildYearlyAverages(field.key, records);
      if (ya) {
        field['yearlyAverages'] = ya;
      }
      fields.push(field);
    }
    variance.fields = fields;
  } catch (error) {
    throw new Error(error);
  }
}

// Yoinked from Activity POST
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
        throw new Error(err);
      }
    }
  }
  return records;
}

function buildHistoricalAverage(field, records) {
  // Yoinked from variance utils
  const filteredRecords = records.filter((val) => val?.[field] !== null && !isNaN(val?.[field]));
  const averageHistoricValue = filteredRecords.reduce((acc, val) => acc + val?.[field], 0) / filteredRecords.length;
  return averageHistoricValue;
}

function buildYearlyAverages(field, records) {
  let averages = {};
  const filteredRecords = records.filter((val) => val?.[field] !== null && !isNaN(val?.[field]));
  for (const record of filteredRecords) {
    const year = record.sk.slice(0, 4);
    averages[year] = record[field];
  }
  return averages;
}

run();