const fs = require('fs');
const { DateTime } = require('luxon');
const {
  VARIANCE_CSV_SCHEMA,
  VARIANCE_STATE_DICTIONARY,
  EXPORT_VARIANCE_CONFIG,
  MISSING_CSV_HEADERS,
  EXPORT_MONTHS
} = require('/opt/constantsLayer');
const {
  getParks,
  TABLE_NAME,
  dynamoClient,
  PutItemCommand,
  marshall,
  s3Client,
  PutObjectCommand,
  flattenConfig,
  runQuery,
  logger,
  getSubAreas
} = require('/opt/baseLayer');

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
      const missingRecords = await getMissingRecords(fiscalYearEnd, roles, orcs);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.FORMATTING);

      // format records for csv

      // create csv
      const csv = await createCSV(missingRecords, fiscalYearEnd);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING);

      // upload csv to S3
      await uploadToS3(csv);
      await updateJobWithState(VARIANCE_STATE_DICTIONARY.UPLOADING);

      // success!
      LAST_SUCCESSFUL_JOB = {
        key: S3_KEY,
        dateGenerated: new Date().toISOString()
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

    // no data, no report
    case 0:
      state = 'no_data';
      percentage = percentageOverride || 100;
      message = 'No data - no report generated.';
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
    dateGenerated: new Date().toISOString()
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
    Item: marshall(jobObj)
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
  const dates = getMonthsInFiscal(fiscalYearEnd);

  // All activities we're looping through
  const activityList = Object.keys(EXPORT_VARIANCE_CONFIG);

  let missingRecords = [];

  try {
    // cycle through parks
    for (const orcs of orcsList) {
      updateHighAccuracyJobState(1, orcsList.indexOf(orcs), orcsList.length, 70);

      // Need to get the subareas from the orc
      if (isAdmin) {
        saidList = await getSubAreas(orcs);
      }

      // cycle through subareas
      for (let said of saidList) {
        // saidList gets the sk from the kc role, but if sysadmin we need to dig
        // into the object a bit to get the subarea id
        if (isAdmin) {
          said = said['sk'];
        }

        // We have to get the bundle and this is probably the best time to do so.
        // Also get the subAreaName for ease later
        let bundle;
        let subAreaName;
        const subArea = await runQuery({
          TableName: TABLE_NAME,
          ExpressionAttributeValues: {
            ':pk': { S: `park::${orcs}` },
            ':sk': { S: `${said}` }
          },
          KeyConditionExpression: 'pk = :pk AND sk = :sk'
        });

        // cycle through the activities
        for (const activity of activityList) {
          // Get all the subarea records
          const subAreaQueryObj = {
            TableName: TABLE_NAME,
            ExpressionAttributeValues: {
              ':pk': { S: `${said}::${activity}` }
            },
            KeyConditionExpression: 'pk = :pk'
          };

          // Get all the records for the subarea and activity
          const records = await runQuery(subAreaQueryObj);

          // This is where we add the bundle to the records
          if (records && records.length > 0) {
            // Append the bundle here
            for (let record of records) {
              record.bundle = subArea[0].bundle;
            }

            // We format the records so they're easier to parse later, making them
            // an object that's nested as { bundle: { park: { date: {...}}}}
            const formattedRecords = formatRecords(records);

            // We then parse through the object to find where/when items are
            // missing data. We pass in activity and subAreaName for records that
            // are missing any information, as we need to build "no data" records
            missingRecords.push(findMissingRecords(formattedRecords, dates, activity, subArea[0].subAreaName));
          }
        }
      }
    }

    return missingRecords;
  } catch (error) {
    throw `Error querying missing records: ${error}`;
  }
}

function findMissingRecords(records, fiscalYearDates, activity, subAreaName) {
  const missingRecords = {};

  // Get all keys
  const bundles = Object.keys(records);
  let parks;

  for (const bundle of bundles) {
    parks = Object.keys(records?.[bundle] ?? {});

    for (const park of parks) {
      for (const date of fiscalYearDates) {
        let recordCheck = {};

        if (!records[bundle][park]?.[date]) {
          // We also need to add any "no data" items for dates that are missing up to
          // today's date. These will be omitted if the previous year's months are missing
          // data anyway (i.e. December never has data, won't trigger as missing later).
          records[bundle][park][date] = {
            bundle,
            parkName: park,
            date,
            subAreaName
          };
        }

        recordCheck = records[bundle][park][date];

        // If we have a match for this bundle, park, and date, get the activities for it
        const requiredFields = EXPORT_VARIANCE_CONFIG[activity];
        // Check if the activity's fields have any values in the current record
        const missingFields = Object.keys(requiredFields).filter(
          (field) => !Object.prototype.hasOwnProperty.call(recordCheck, field)
        );
        // Now that we know what fields are missing, check the previous years
        for (const missingField of missingFields) {
          const prevYearsData = checkPreviousYears(records, bundle, park, date, missingField);
          if (prevYearsData.length > 0) {
            missingRecords[bundle] = missingRecords[bundle] || {};
            missingRecords[bundle][park] = missingRecords[bundle][park] || {};
            // Add the current year
            missingRecords[bundle][park][date] = records[bundle][park][date];
            // Add the records of yesteryear
            for (const record of prevYearsData) {
              missingRecords[record.bundle][record.parkName][record.date] = record;
            }
          }
        }
      }
    }
  }

  return missingRecords;
}

function checkPreviousYears(record, bundle, park, date, missingField) {
  let missingRecords = [];
  let missingFound = false;
  let year = parseInt(date.slice(0, 4), 10); // 2024
  let month = date.slice(4);

  let prevYear = year - 1;
  // Get the previous three years beyond the current year
  while (prevYear >= year - 3) {
    const prevDate = `${prevYear}${month}`;
    // Check if the date exists
    if (record[bundle][park][prevDate]) {
      // Check if the activity that's missing this year exists in the prev year
      if (record[bundle][park][prevDate][missingField]) {
        missingFound = true;
      }

      // We push every record regardless, so if one is missing we have all prev
      // years to share in the report
      missingRecords.push(record[bundle][park][prevDate]);
    } else {
      // No data exists for that year/month at all, so we add a "no data" item
      const noData = {
        bundle: [bundle],
        parkName: [park],
        date: [prevDate]
      };
      missingRecords.push(noData);
    }

    prevYear--;
  }

  // Only send back the previous records if at least one is missing
  if (!missingFound) {
    missingRecords = [];
  }

  return missingRecords;
}

function updateHighAccuracyJobState(state, index, total, size) {
  if (index % JOB_UPDATE_MODULO === 0) {
    const increment = (JOB_UPDATE_MODULO * size) / total;
    const percentage = Math.floor(CURRENT_PROGRESS_PERCENT + increment);
    updateJobWithState(state, percentage);
  }
}

function getMonthsInFiscal(fiscalYearEnd) {
  const dates = [];
  for (let i = 1; i <= 12; i++) {
    let year = fiscalYearEnd;
    if (i > 3) {
      year -= 1;
    }
    dates.push(year + String(i).padStart(2, '0'));
  }
  return dates;
}

function createCSV(missingRecords, fiscalYearEnd) {
  const dates = getMonthsInFiscal(fiscalYearEnd);
  const todayDate = DateTime.now().toFormat('yyyyLL');
  const startYear = Number(fiscalYearEnd);
  const yearRanges = generateYearRanges(startYear);
  const { missingHeadersRow, subHeadersRow } = constructHeaderRows(MISSING_CSV_HEADERS, yearRanges, [
    'Missing',
    'Notes'
  ]);

  // Add space before the date ranges for bundle, park, subarea, and months
  subHeadersRow.unshift('', '', '', '');

  let content = [missingHeadersRow, subHeadersRow];

  for (const missingRecord of missingRecords) {
    for (const bundle of Object.keys(missingRecord)) {
      for (const park of Object.keys(missingRecord[bundle])) {
        let subAreaName;
        for (const date of dates) {
          if (date < todayDate && missingRecord[bundle][park][date]) {
            // We're going to add the bundle, park, subarea, and months as they appear
            subAreaName = missingRecord[bundle][park][date]?.['subAreaName'] || subAreaName;
            let subAreaRow = [];
            const year = parseInt(date.slice(0, 4), 10); // 2024
            const month = date.slice(4);

            for (const item of flattenConfig(EXPORT_VARIANCE_CONFIG)) {
              subAreaRow.push(missingRecord[bundle][park][`${year - 3}${month}`][item] || ''); // Three years ago
              subAreaRow.push(missingRecord[bundle][park][`${year - 2}${month}`][item] || ''); // Two years ago
              subAreaRow.push(missingRecord[bundle][park][`${year - 1}${month}`][item] || ''); // One year ago
              subAreaRow.push(missingRecord[bundle][park][date][item] || ''); // Current year

              if (
                !missingRecord[bundle][park][date][item] &&
                ((missingRecord[bundle][park][`${year - 1}${month}`][item] &&
                  missingRecord[bundle][park][`${year - 1}${month}`][item] !== 0) ||
                  (missingRecord[bundle][park][`${year - 2}${month}`][item] &&
                    missingRecord[bundle][park][`${year - 2}${month}`][item] !== 0) ||
                  (missingRecord[bundle][park][`${year - 3}${month}`][item] &&
                    missingRecord[bundle][park][`${year - 3}${month}`][item] !== 0))
              ) {
                subAreaRow.push('Missing Data');
              } else {
                // Not missing data, add empty space to that column
                subAreaRow.push('');
              }
              subAreaRow.push(missingRecord[bundle][park].notes || ''); // Notes
            }

            // Add these to the start of the array because we might not have subAreaName early on
            // Throw these into this strange format: `"${variable}"` as the double quotes help
            // with any rogue special names/characters we don't want to affect the csv output
            subAreaRow.unshift(`"${bundle}"`, `"${park}"`, `"${subAreaName}"`, convertMonth(date.slice(4)));

            content.push(subAreaRow);
          }
        }
      }
    }
  }

  let csvData = '';
  for (const row of content) {
    csvData += row.join(',') + '\r\n';
  }
  return csvData;
}

// We format the records so they're easier to parse later.
// The records are organized from an array of records into
// an object of { bundle: { parkName: { year: { month: [records] }}}
function formatRecords(records) {
  const groupedRecords = {};

  for (const record of records) {
    const bundle = record.bundle;
    const park = record.parkName;
    const date = record.date;

    if (!groupedRecords[bundle]) {
      groupedRecords[bundle] = {};
    }

    if (!groupedRecords[bundle][park]) {
      groupedRecords[bundle][park] = {};
    }

    if (!groupedRecords[bundle][park][date]) {
      groupedRecords[bundle][park][date] = {};
    }

    groupedRecords[bundle][park][date] = { ...record };
  }

  return groupedRecords;
}

function constructHeaderRows(MISSING_CSV_HEADERS, yearRanges, staticSubHeaders) {
  let missingHeadersRow = ['Bundle, Park, Subarea, Month'];
  let subHeadersRow = [];

  // For each activity, we need to add the name of the activity and then the five
  // additional spaces. The subheaders is also created with years, Variance, and Notes cells
  for (let i = 0; i < MISSING_CSV_HEADERS.length; i++) {
    missingHeadersRow = [...missingHeadersRow, MISSING_CSV_HEADERS[i], '', '', '', '', ''];
    subHeadersRow = [...subHeadersRow, ...yearRanges, ...staticSubHeaders];
  }

  return { missingHeadersRow, subHeadersRow };
}

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
    Body: buffer
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
    'December'
  ];

  if (monthNumber >= 1 && monthNumber <= 12) {
    return months[monthNumber - 1];
  } else {
    return 'Invalid month number';
  }
}
