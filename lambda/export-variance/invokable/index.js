const { logger } = require("../../logger")
const AWS = require('aws-sdk');
const fs = require('fs');

const { VARIANCE_CSV_SCHEMA, VARIANCE_STATE_DICTIONARY } = require("../../constants");
const { getParks, TABLE_NAME, dynamodb, runQuery } = require("../../dynamoUtil");
const s3 = new AWS.S3();

const FILE_PATH = process.env.FILE_PATH || "./";
const FILE_NAME = process.env.FILE_NAME || "A&R_Variance_Report";

let LAST_SUCCESSFUL_JOB = {};
let JOB_ID;
let S3_KEY;
let PARAMS;
let JOB_UPDATE_MODULO = 20;
let CURRENT_PROGRESS_PERCENT = 0;

exports.handler = async (event, context) => {
  logger.debug("Running export invokable: ", event);

  try {
    LAST_SUCCESSFUL_JOB = event.lastSuccessfulJob || {};
    if (event?.jobId && event?.params?.roles) {
      JOB_ID = event.jobId;
      S3_KEY = JOB_ID + "/" + FILE_NAME + ".csv";
      const roles = event?.params?.roles;
      PARAMS = event?.params;

      // The spreadsheet schema should not change depending on role, so it can be static
      const schema = VARIANCE_CSV_SCHEMA;

      // Get variances
      const fiscalYearEnd = event?.params?.fiscalYearEnd;

      // must provide fiscal year end
      if (!fiscalYearEnd) {
        throw new Error("Missing fiscal year end parameter");
      }

      await updateJobWithState(VARIANCE_STATE_DICTIONARY.FETCHING);

      // collect variance records
      const records = await getVarianceRecords(fiscalYearEnd, roles);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.FORMATTING);

      // format records for csv
      formatRecords(records);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.GENERATING);

      // create csv
      const csv = createCSV(records);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING);

      // upload csv to S3
      await uploadToS3(csv);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING);
      
      // success!
      LAST_SUCCESSFUL_JOB = {
        key: S3_KEY,
        dateGenerated: new Date().toISOString(),
      }
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING, 95);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.COMPLETE);

    }
  } catch (error) {
    logger.error("Error running export invokable: ", error);
    await updateJobWithState(VARIANCE_STATE_DICTIONARY.ERROR)
  }
}

async function updateJobWithState(state, percentageOverride = null) {
  let percentage = null;
  let message = '';
  switch (state) {
    // error
    case 99:
      state = 'error';
      message = 'Job failed. Exporter encountered an error.';
      break;
    // fetching data
    case 1:
      state = 'fetching_data';
      percentage = percentageOverride || 10;
      message = 'Fetching data from database.';
      break;
    case 2:
      state = 'formatting_records';
      percentage = percentageOverride || 80;
      message = 'Formatting records.';
      break;
    case 3:
      state = 'generating_report';
      percentage = percentageOverride || 90;
      message = 'Generating report.';
      break;
    case 4:
      state = 'uploading_report';
      percentage = percentageOverride || 95;
      message = 'Uploading report.';
      break;
    case 5:
      state = 'complete';
      percentage = percentageOverride || 100;
      message = 'Complete.';
      break;
    default:
      break;
  }
  let jobObj = {
    pk: 'variance-exp-job',
    sk: JOB_ID,
    progressState: state,
    progressPercentage: percentage,
    progressDescription: message,
    lastSuccessfulJob: LAST_SUCCESSFUL_JOB,
    key: S3_KEY,
    params: PARAMS,
    dateGenerated: new Date().toISOString(),
  }
  try {
    await updateJobEntry(jobObj);
    CURRENT_PROGRESS_PERCENT = jobObj.progressPercentage;
  } catch (error) {
    throw new Error("Error updating job: " + error);
  }
}


async function updateJobEntry(jobObj) {
  const putObj = {
    TableName: TABLE_NAME,
    Item: AWS.DynamoDB.Converter.marshall(jobObj)
  }
  await dynamodb.putItem(putObj).promise();
}

async function getVarianceRecords(fiscalYearEnd, roles) {
  // determine permissions from roles
  const isAdmin = roles.includes('sysadmin');

  // determine orcs & saids roles has access to
  let orcsList = [];
  let saidList = [];
  if (isAdmin) {
    // must check all parks.
    const parks = await getParks();
    orcsList = parks.map(park => park.orcs)
  } else {
    // must check only parks that the user has access to
    for (const role of roles) {
      const orcs = role.split(':')[0];
      const said = role.split(':')[1];
      if (!orcsList.includes(orcs)) {
        orcsList.push(orcs);
      }
      if (!saidList.includes(said)) {
        saidList.push(said);
      }
    }
  }

  // determine months in fiscal year
  const dates = [];
  for (let i = 1; i <= 12; i++) {
    let year = fiscalYearEnd;
    if (i > 3) {
      year -= 1;
    }
    dates.push(year + String(i).padStart(2, '0'))
  }

  // get all variance records
  const varianceQueryObj = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {
    }
  }

  let varianceRecords = [];

  try {
    // cycle through parks
    for (const orcs of orcsList) {
      updateHighAccuracyJobState(1, orcsList.indexOf(orcs), orcsList.length, 70);
      // cycle through months
      for (const date of dates) {
        // add to query
        const varianceQueryObj = {
          TableName: TABLE_NAME,
          ExpressionAttributeValues: {
            ':pk': { S: `variance::${orcs}::${date}` }
          },
          KeyConditionExpression: 'pk = :pk'
        }
        // get records
        let records = await runQuery(varianceQueryObj);
        // filter records without subarea access
        if (!isAdmin) {
          records = records.filter(record => {
            const said = record?.sk?.split('::')[0];
            return saidList.includes(said);
          })
        }
        // add to array
        if (records.length > 0) {
          varianceRecords = varianceRecords.concat(records);
        }
      }
    }
    return varianceRecords;
  } catch (error) {
    throw `Error querying variance records: ${error}`;
  }
}

function updateHighAccuracyJobState(state, index, total, size){
  if (index % JOB_UPDATE_MODULO === 0) {
     const increment = JOB_UPDATE_MODULO*size/total;
     const percentage = Math.floor(CURRENT_PROGRESS_PERCENT + increment);
     updateJobWithState(state, percentage);
  }
}

function formatRecords(records) {
  for (const record of records) {
    // list all variances as semicolon separated string so it can be parsed later
    if (record.fields.length > 0) {
      let fields = [];
      for (const field of record.fields) {
        fields.push(String(field.key + " " + parseFloat(field.percentageChange) * 100 + "%"));
      }
      record['fields'] = fields.join("; ");
    }
    const date = record.pk.split('::')[2];
    record['year'] = date.slice(0, 4);
    record['month'] = date.slice(4);
  }
}

function createCSV(records) {
  let content = [VARIANCE_CSV_SCHEMA];
  for (const record of records) {
    content.push([
      record.bundle || 'N/A',
      record.orcs || 'N/A',
      record.parkName || 'N/A',
      record.subAreaName || 'N/A',
      record.subAreaId || 'N/A',
      record.sk.split('::')[1] || 'N/A',
      record.year || 'N/A',
      record.month || 'N/A',
      record.notes || '',
      record.fields || ''
    ])
  }
  let csvData = '';
  for (const row of content) {
    csvData += row.join(',') + '\r\n';
  }
  return csvData;
}

async function uploadToS3(csvData) {
  // write file
  const filePath = FILE_PATH + FILE_NAME + '.csv';
  fs.writeFileSync(filePath, csvData);
  logger.debug("File written.");
  // get buffer
  const buffer = fs.readFileSync(filePath);

  const params = {
    Bucket: process.env.S3_BUCKET_DATA,
    Key: S3_KEY,
    Body: buffer,
  }

  if (!process.env.IS_OFFLINE) {
    await s3.putObject(params).promise();
  }
  logger.debug("Uploaded to S3");

}