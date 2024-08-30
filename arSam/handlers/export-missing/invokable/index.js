const fs = require('fs');
const { DateTime } = require('luxon');
const {
  VARIANCE_CSV_SCHEMA,
  VARIANCE_STATE_DICTIONARY,
  EXPORT_VARIANCE_CONFIG,
  MISSING_CSV_HEADERS,
  EXPORT_MONTHS,
} = require('/opt/constantsLayer');
const {
  getParks,
  TABLE_NAME,
  dynamoClient,
  PutItemCommand,
  getOne,
  marshall,
  s3Client,
  PutObjectCommand,
  flattenConfig,
  runQuery,
  logger,
} = require('/opt/baseLayer');
const { pbkdf2 } = require('crypto');
const { info } = require('console');

const FILE_PATH = process.env.FILE_PATH || '/tmp/';
const FILE_NAME = process.env.FILE_NAME || 'A&R_Missing_Report';

let LAST_SUCCESSFUL_JOB = {};
let JOB_ID;
let S3_KEY;
let PARAMS;
let JOB_UPDATE_MODULO = 20;
let CURRENT_PROGRESS_PERCENT = 0;

exports.handler = async (event, context) => {
  logger.debug('Running export invokable: ', event);

  try {
    LAST_SUCCESSFUL_JOB = event.lastSuccessfulJob || {};
    if (event?.jobId && event?.params?.roles) {
      JOB_ID = event.jobId;
      S3_KEY = JOB_ID + '/' + FILE_NAME + '.csv';
      const roles = event?.params?.roles;
      PARAMS = event?.params;

      // The spreadsheet schema should not change depending on role, so it can be static
      const schema = VARIANCE_CSV_SCHEMA;

      // Get variances
      const fiscalYearEnd = event?.params?.fiscalYearEnd;

      // Get orcs
      const orcs = event?.params?.orcs;

      // must provide fiscal year end
      if (!fiscalYearEnd) {
        throw new Error('Missing fiscal year end parameter');
      }

      await updateJobWithState(VARIANCE_STATE_DICTIONARY.FETCHING, `Fetching all entries`);

      logger.info(`=== Exporting filtered data ===`);

      // collect missing records, use VARIANCE_STATE as it's the same
      const records = await getMissingRecords(fiscalYearEnd, roles, orcs);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.FORMATTING);

      // format records for csv
      formatRecords(records);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.GENERATING);

      // create csv
      const csv = await createCSV(records, fiscalYearEnd);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING);

      // upload csv to S3
      await uploadToS3(csv);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING);

      // success!
      LAST_SUCCESSFUL_JOB = {
        key: S3_KEY,
        dateGenerated: new Date().toISOString(),
      };
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING, 95);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.COMPLETE);
    }
  } catch (error) {
    logger.error('Error running export invokable: ', error);
    await updateJobWithState(VARIANCE_STATE_DICTIONARY.ERROR);
  }
};

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
    pk: 'missing-exp-job',
    sk: JOB_ID,
    progressState: state,
    progressPercentage: percentage,
    progressDescription: message,
    lastSuccessfulJob: LAST_SUCCESSFUL_JOB,
    key: S3_KEY,
    params: PARAMS,
    dateGenerated: new Date().toISOString(),
  };
  try {
    await updateJobEntry(jobObj);
    CURRENT_PROGRESS_PERCENT = jobObj.progressPercentage;
  } catch (error) {
    throw new Error('Error updating job: ' + error);
  }
}

async function updateJobEntry(jobObj) {
  const putObj = {
    TableName: TABLE_NAME,
    Item: marshall(jobObj),
  };
  await dynamoClient.send(new PutItemCommand(putObj));
}

async function getMissingRecords(fiscalYearEnd, roles, singleOrcs = undefined) {
  const isAdmin = roles.includes('sysadmin');

  let orcsList = [];
  let saidList = [];
  if (isAdmin) {
    // must check all parks.
    const parks = await getParks();
    orcsList = parks.map((park) => park.orcs);
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

  // Replace with just the one park to be searched
  if (singleOrcs) {
    orcsList = [singleOrcs];
  }

  // determine months in fiscal year
  const dates = [];
  for (let i = 1; i <= 12; i++) {
    let year = fiscalYearEnd;
    if (i > 3) {
      year -= 1;
    }
    dates.push(year + String(i).padStart(2, '0'));
  }

  // get all missing records
  const missingQueryObj = {
    TableName: TABLE_NAME,
    ExpressionAttributeValues: {},
  };

  let missingRecords = [];

  try {
    // cycle through parks
    for (const orcs of orcsList) {
      updateHighAccuracyJobState(1, orcsList.indexOf(orcs), orcsList.length, 70);

      // cycle through months
      for (const date of dates) {
        // add to query
        const missingQueryObj = {
          TableName: TABLE_NAME,
          ExpressionAttributeValues: {
            ':pk': { S: `variance::${orcs}::${date}` },
          },
          KeyConditionExpression: 'pk = :pk',
        };

        // get records
        let records = await runQuery(missingQueryObj);

        // unless user is admin, filter out subareas they don't have access to
        if (!isAdmin) {
          records = records.filter((record) => {
            const said = record?.sk?.split('::')[0];
            return saidList.includes(said);
          });
        }

        // Loop through the variance fields
        if (records.length > 0) {
          for (const record of records) {
            // Looking for fields that have at least one field -1
            if (record.fields && record.fields.length > 0 && hasMissingField(record.fields)) {
              missingRecords.push(record);
            }
          }
        }
      }
    }

    return missingRecords;
  } catch (error) {
    throw `Error querying missing records: ${error}`;
  }
}

function updateHighAccuracyJobState(state, index, total, size) {
  if (index % JOB_UPDATE_MODULO === 0) {
    const increment = (JOB_UPDATE_MODULO * size) / total;
    const percentage = Math.floor(CURRENT_PROGRESS_PERCENT + increment);
    updateJobWithState(state, percentage);
  }
}

// Return as soon as we find percentageChange of -1, i.e. 'Missing'
function hasMissingField(fields) {
  return fields.some((field) => field.percentageChange === -1);
}

// Make sure that we're matching the VARIANCE config
function formatRecords(records) {
  for (const record of records) {
    if (record.fields.length > 0) {
      for (const field of record.fields) {
        // We want to filter any records that have -100% variance
        const flattenedConfig = flattenConfig(EXPORT_VARIANCE_CONFIG);
        if (flattenedConfig.includes(field.key) && field.percentageChange == -1) {
          record[field.key] = 'Missing';
        }
      }
    }

    // We'll use month for grouping when creating CSV
    const date = record.pk.split('::')[2];
    record['month'] = convertMonth(parseInt(date.slice(4)));
    if (/\r\n|\n|\r/.test(record.notes)) {
      record.notes = record.notes.replace(/(\r\n|\n|\r)/g, ' ');
    }
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

    // Want to have three items (even if there's no data) when we send this back
    if (records.length < 3) {
      const itemsToAdd = 3 - records.length;
      for (let i = 0; i < itemsToAdd; i++) {
        records.push({});
      }
    }
  }

  return records;
}

async function createCSV(records, year) {
  const startYear = Number(year);
  const yearRanges = generateYearRanges(startYear);
  const { missingHeadersRow, subHeadersRow } = constructHeaderRows(MISSING_CSV_HEADERS, yearRanges, [
    'Missing',
    'Notes',
  ]);

  // Add space before dates - bundles and subareas go below this column
  subHeadersRow.unshift('');

  let content = [missingHeadersRow, subHeadersRow];

  // Get an object where the records are sorted by bundle, then park, and then by month
  // { bundle: { park: { month: [records] }, { next month: [records] } }, ... }
  const recordsGroupedBundleParkMonth = records.reduce((groupedRecords, record) => {
    const bundle = record.bundle;
    const park = record.parkName;
    const month = record.month;

    if (!groupedRecords[bundle]) {
      groupedRecords[bundle] = {};
    }

    if (!groupedRecords[bundle][park]) {
      groupedRecords[bundle][park] = {};
    }

    if (!groupedRecords[bundle][park][month]) {
      groupedRecords[bundle][park][month] = [];
    }

    groupedRecords[bundle][park][month].push(record);
    return groupedRecords;
  }, {});

  // We go through each bundle, then each park, and then each month for that park
  // and then each row is the subareas and the activity data for that subarea
  for (const bundle of Object.keys(recordsGroupedBundleParkMonth)) {
    for (const park of Object.keys(recordsGroupedBundleParkMonth[bundle])) {
      // Add bundle and park as a sidebar heading
      content.push([`Bundle: ${bundle}`]);
      content.push([`Park: ${park}`]);

      for (const month of Object.keys(recordsGroupedBundleParkMonth[bundle][park])) {
        // Add month as a sidebar heading
        content.push([month]);

        // Start looping for each month in the park
        for (const record of recordsGroupedBundleParkMonth[bundle][park][month]) {
          const startDate = record.pk.split('::')[2];
          const subAreaId = record.subAreaId;
          const activity = record.sk.split('::')[1];

          const previousRecords = await getPreviousYearData(3, subAreaId, activity, startDate);
          const currentRecord = await getOne(`${subAreaId}::${activity}`, startDate);

          // Row starts with sub area name, e.g. "Buttle Lake"
          let subAreaRow = [record.subAreaName];

          // For each matching item/activity, push the data that's found
          for (const item of flattenConfig(EXPORT_VARIANCE_CONFIG)) {
            subAreaRow.push(previousRecords[2][item] || ''); // e.g. 2020-2021
            subAreaRow.push(previousRecords[1][item] || ''); // e.g. 2021-2022
            subAreaRow.push(previousRecords[0][item] || ''); // e.g. 2022-2023
            subAreaRow.push(currentRecord[item]); // e.g. 2023-2024
            subAreaRow.push(record[item] || ''); // Variance heading (Missing)
            subAreaRow.push(currentRecord['notes']?.replace(/,/g, '') || '');
          }

          content.push(subAreaRow);
        }
      }

      content.push(['']); // new row for readability between parks
    }

    content.push(['']); // new row for readability between bundles
  }

  let csvData = '';
  for (const row of content) {
    csvData += row.join(',') + '\r\n';
  }
  return csvData;
}

// Used for the main headers.
// We have four years, Variance and Notes columns for each activity, so we add empty
// strings/cells to account for the additional columns beneath the activity header
function constructHeaderRows(MISSING_CSV_HEADERS, yearRanges, staticSubHeaders) {
  let missingHeadersRow = ['Parks by Month'];
  let subHeadersRow = [];

  // For each activity, we need to add the name of the activity and then the five
  // additional spaces. The subheaders is also created with years, Variance, and Notes cells
  for (let i = 0; i < MISSING_CSV_HEADERS.length; i++) {
    missingHeadersRow = [...missingHeadersRow, MISSING_CSV_HEADERS[i], '', '', '', '', ''];
    subHeadersRow = [...subHeadersRow, ...yearRanges, ...staticSubHeaders];
  }

  return { missingHeadersRow, subHeadersRow };
}

// Used for the subheaders, creates the "2021-2022, 2022-2023, ..." headings
function generateYearRanges(startYear) {
  let ranges = [];
  for (let i = 4; i > 0; i--) {
    ranges.push(`${startYear - i}-${startYear - i + 1}`);
  }
  return ranges;
}

async function uploadToS3(csvData) {
  // write file
  const filePath = FILE_PATH + FILE_NAME + '.csv';
  fs.writeFileSync(filePath, csvData);
  logger.debug('File written.');
  // get buffer
  const buffer = fs.readFileSync(filePath);

  const params = {
    Bucket: process.env.S3_BUCKET_DATA,
    Key: S3_KEY,
    Body: buffer,
  };

  const command = new PutObjectCommand(params);
  await s3Client.send(command);
  logger.debug('File successfully uploaded to S3');
}

function convertMonth(monthNumber) {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  if (monthNumber >= 1 && monthNumber <= 12) {
    return months[monthNumber - 1];
  } else {
    return 'Invalid month number';
  }
}
