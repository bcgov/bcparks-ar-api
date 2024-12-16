const {
  calculateVariance,
  dynamoClient,
  getOne,
  incrementAndGetNextSubAreaID,
  marshall,
  runQuery,
  TABLE_NAME,
  TransactWriteItemsCommand,
  getParks,
  getSubAreas
} = require('../layers/baseLayer/baseLayer.js');
const { EXPORT_VARIANCE_CONFIG } = require('../layers/constantsLayer/constantsLayer.js');
const { DateTime } = require('luxon');
const fs = require('fs').promises;
const path = require('path');

// Write the changes to a txt file for auditing later
async function logToFile(message, obj = null) {
  console.log(message, obj ? obj : '');
  const logFilePath = path.join(__dirname, 'discrepancies-log.txt');
  try {
    const logEntry = obj ? JSON.stringify(obj, null, 2) : '';

    return fs.appendFile(logFilePath, `${message}${logEntry}\n---------------\n`);
  } catch (error) {
    console.error('Error writing to log file:', error);
    throw error; // Re-throw the error so it can be handled by the caller
  }
}

async function getAllOrcs() {
  await logToFile('Fetching all of the orcs...');

  // Get a list of all the parks (which are now up to date)
  const allParks = await getParks();

  // Get all the orcs for each park (which are likewise all up to date)
  let allOrcs = allParks.filter((park) => park.orcs).map((park) => park.orcs);

  let orcsObj = {};
  for (const orcs of allOrcs) {
    const subAreas = await getSubAreas(orcs);
    orcsObj[orcs] = {};

    // Create an object that's { orcs: { subAreaId: { ... }}} for some easier
    // parsing later
    for (const subArea of subAreas) {
      // Make the subArea id the key of the obj
      orcsObj[orcs][subArea.sk] = {};
      orcsObj[orcs][subArea.sk].activities = subArea.activities || {};
      orcsObj[orcs][subArea.sk].parkName = subArea.parkName || '';
      orcsObj[orcs][subArea.sk].managementArea = subArea.managementArea || '';
      orcsObj[orcs][subArea.sk].section = subArea.section || '';
      orcsObj[orcs][subArea.sk].bundle = subArea.bundle || '';
      orcsObj[orcs][subArea.sk].isLegacy = subArea.isLegacy || '';
      orcsObj[orcs][subArea.sk].region = subArea.region || '';
      orcsObj[orcs][subArea.sk].roles = subArea.roles || ['sysadmin'];
      orcsObj[orcs][subArea.sk].subAreaName = subArea.subAreaName || '';
    }
  }

  return orcsObj;
}

// Helper function for checking if two items are equal, mimic _.isEqual
function isEqual(a, b) {
  // Handle primitive types
  if (a === b) return true;
  if (a == null || b == null) return false;

  // Handle NaN
  if (Number.isNaN(a) && Number.isNaN(b)) return true;

  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!isEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

// Helper function to determine if item is empty, mimic _.isEmpty
function isEmpty(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'object' && Object.keys(value).length === 0) ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}

// For comparing two arrays, but comparing based on pk and sk
function compareArrays(arr1, arr2) {
  const map1 = new Map();
  const map2 = new Map();

  arr1.forEach((item) => map1.set(`${item.pk}::${item.sk}`, item));
  arr2.forEach((item) => map2.set(`${item.pk}::${item.sk}`, item));

  const result = [];

  // Loop through the old record and see if the new record has the same data,
  // make a note of the differences or if the data was removed
  map1.forEach((item1, key) => {
    const item2 = map2.get(key);
    if (item2) {
      const diff = compareObjects(item1, item2);
      if (Object.keys(diff).length > 0) {
        result.push({ pk: item1.pk, sk: item1.sk, differences: diff });
      }
    } else {
      result.push({ pk: item1.pk, sk: item1.sk, removed: true, record: item1 });
    }
  });

  // Loop through the new record and see if the data exists in the old data,
  // if it doesn't, then we make a note saying it was added
  map2.forEach((item2, key) => {
    if (!map1.has(key)) {
      result.push({ pk: item2.pk, sk: item2.sk, added: true });
    }
  });

  return result;
}

// For comparing two objects
function compareObjects(obj1, obj2) {
  const ignoredFields = ['lastUpdated', 'config'];
  const result = {};

  // Go through the attributes of the old and new object and see if they exist
  // Track any times the key is undefined in one obj, or doesn't exist
  Object.keys(obj1).forEach((key) => {
    if (!ignoredFields.includes(key)) {
      if (obj2[key] === undefined || obj1[key] !== obj2[key]) {
        result[key] = { old: obj1[key], new: obj2[key] };
      }
    }
  });

  // Likewise, check to see if the old record has the attributes that the new
  // record has. Track any discrepancies
  Object.keys(obj2).forEach((key) => {
    if (!ignoredFields.includes(key) && !result.hasOwnProperty(key)) {
      if (obj1[key] === undefined) {
        result[key] = { old: null, new: obj2[key] };
      }
    }
  });

  return result;
}

// Function from /activity GET to see the previous three years data
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
        console.log(err);
      }
    }
  }

  return records;
}

// Same function from /activity GET, but compares the current record
// with the previous records to see where the variances are
function checkVariances(currentRecord, records, activity) {
  // Create a variance field array
  let fields = [];
  let varianceWasTriggered = false;

  // Map through all fields we care about and check their values
  let varianceConfig = EXPORT_VARIANCE_CONFIG[activity];
  const fieldsToCheck = Object.keys(varianceConfig);

  if (records.length > 0) {
    for (const field in fieldsToCheck) {
      let current = currentRecord?.[fieldsToCheck[field]];
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

      if (!current === undefined || !first === undefined) {
        // We skip comparing against fields that are undefined. TBD Business logic.
        // Move onto the next field
        console.log('Undefined field - skipping.');
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
  }

  return fields;
}

async function consolidateAllActivities(orcsObj) {
  let transactionObj = { TransactItems: [] };
  await logToFile('Fetching all the activities...');

  // Now that we have an obj of the orcs and subAreas we can look at the
  // activities and start an equality check between old db and new db
  for (const orcs of Object.keys(orcsObj)) {
    for (const subArea of Object.keys(orcsObj[orcs])) {
      for (const activity of orcsObj[orcs][subArea].activities) {
        try {
          const oldActivityQuery = {
            TableName: 'parksar-XtbzOY7u',
            ExpressionAttributeValues: {
              ':pk': { S: `${subArea}::${activity}` }
            },
            KeyConditionExpression: 'pk = :pk'
          };

          const newActivityQuery = {
            TableName: TABLE_NAME,
            ExpressionAttributeValues: {
              ':pk': { S: `${subArea}::${activity}` }
            },
            KeyConditionExpression: 'pk = :pk'
          };

          // Get all the new and old subarea::activity records
          const oldActivity = await runQuery(oldActivityQuery);
          const newActivity = await runQuery(newActivityQuery);

          // Check for any differences
          let comparisonResult;
          if (!isEqual(oldActivity, newActivity)) {
            comparisonResult = compareArrays(oldActivity, newActivity);
            if (comparisonResult.length > 0) {
              for (const item of comparisonResult) {
                // Look for items that are from 2024 at the earliest
                // legacyData won't get through, but skip it if it does just in case
                const date = Number(item.sk.slice(0, 4));
                if (date >= 2024 && (!item.differences?.legacyData?.old || !item.differences?.legacyData?.new)) {
                  // For any items that have been 'removed' (only found in the old db)
                  // we want to fully add the record to the new db
                  if (item.removed && item.record) {
                    const lastItemIndex = oldActivity.length != 0 ? oldActivity.length - 1 : 0;
                    await logToFile(
                      `Adding this activity - pk: ${item.pk} sk: ${item.sk}\n  Park: ${item.record.parkName},\n  SubArea: ${item.record.subAreaName}\n  Date: ${item.sk},\n`
                    );

                    transactionObj.TransactItems.push({
                      Put: {
                        TableName: TABLE_NAME,
                        Item: marshall(item.record),
                        ConditionExpression: 'attribute_not_exists(sk)'
                      }
                    });
                  }

                  // Look for differences where we should update
                  if (item.differences !== undefined) {
                    // Log the data that has changes for auditing later
                    let printOut = {};
                    let newData = {};
                    for (const attribute of Object.keys(item.differences)) {
                      // Notes is the only attribute where we can't compare numbers,
                      // just check if the note exist or not
                      {
                        if (attribute === 'notes') {
                          const oldVal = item.differences[attribute].old ?? undefined;
                          const newVal = item.differences[attribute].new ?? undefined;

                          newData[`:${attribute}`] = oldVal && !newVal ? oldVal : newVal;

                          // Skip isLegacy and isLocked because these should only be
                          // different in the new db
                        } else if (attribute !== 'isLocked' && attribute !== 'isLegacy') {
                          // Give null values a -1 so we can compare to what exists
                          const oldVal = item.differences[attribute].old ?? -1;
                          const newVal = item.differences[attribute].new ?? -1;

                          // Maybe the best option is to just take the higher of the two
                          // values? Only make a change if the old data is more than the
                          // new data. Save the log for auditing later.
                          if (oldVal > newVal) {
                            newData[`:${attribute}`] = oldVal;
                          }

                          printOut[attribute] = {};
                          printOut[attribute]['old'] = oldVal;
                          printOut[attribute]['new'] = newVal;
                        }
                      }
                    }

                    // Only making a change if the old data was more than the new data
                    if (!isEmpty(newData)) {
                      const record = await getOne(item.pk, item.sk);
                      await logToFile(
                        `Fixing this activity - pk: ${item.pk} sk: ${item.sk}\n  Park: ${record.parkName},\n  SubArea: ${record.subAreaName}\n  Date: ${item.sk},\n  Notes: ${record.notes ? record.notes : ''}\n  Changes:\n    `,
                        printOut
                      );

                      // Creating expressions for properly inputting the updated data
                      let updateExpression = 'SET ';
                      let expressionAttributeValues = newData;
                      let expressionAttributeNames = {};

                      // Create the object for the expression { #attribute : attribute }
                      Object.entries(newData).forEach(([key, value]) => {
                        // remove the ':' from start of attribute name
                        const attributeName = key.substring(1);
                        expressionAttributeNames[`#${attributeName}`] = attributeName;
                      });

                      // Making the "SET #attribute = :attribute" expression
                      const attributeUpdates = Object.keys(newData)
                        .map((key) => `#${key.substring(1)} = ${key}`)
                        .join(', ');
                      updateExpression += attributeUpdates;

                      transactionObj.TransactItems.push({
                        Update: {
                          TableName: TABLE_NAME,
                          Key: marshall({ pk: item.pk, sk: item.sk }),
                          UpdateExpression: updateExpression,
                          ExpressionAttributeNames: expressionAttributeNames,
                          ExpressionAttributeValues: marshall(expressionAttributeValues)
                        }
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          await logToFile('Issue with finding activities: ', e);
        }
      }
    }
  }

  await executeTransactions(transactionObj);
}

async function consolidateAllVariances(orcsObj) {
  let transactionObj = { TransactItems: [] };
  await logToFile('Fetching all of the variances...');

  for (const orcs of Object.keys(orcsObj)) {
    for (const subArea of Object.keys(orcsObj[orcs])) {
      for (const activity of orcsObj[orcs][subArea].activities) {
        // Only look for variances in the last six months or so
        const minDate = DateTime.now().set({ year: 2024, month: 4, day: 1 }).setZone('America/Vancouver');
        const today = DateTime.now().setZone('America/Vancouver').toFormat('yyyyLL');
        let currentDate = minDate.toFormat('yyyyLL');
        let runningDate = minDate;

        do {
          try {
            const oldVarianceQuery = {
              TableName: 'parksar-XtbzOY7u',
              ExpressionAttributeValues: {
                ':pk': { S: `variance::${orcs}::${currentDate}` },
                ':sk': { S: `${subArea}::${activity}` }
              },
              KeyConditionExpression: 'pk = :pk AND sk = :sk'
            };

            const newVarianceQuery = {
              TableName: TABLE_NAME,
              ExpressionAttributeValues: {
                ':pk': { S: `variance::${orcs}::${currentDate}` },
                ':sk': { S: `${subArea}::${activity}` }
              },
              KeyConditionExpression: 'pk = :pk AND sk = :sk'
            };

            // Get the new and old variance::orcs::date
            const oldVariance = await runQuery(oldVarianceQuery);
            const newVariance = await runQuery(newVarianceQuery);

            // Deep equality check for any differences
            let comparisonResult = [];
            if (!isEqual(oldVariance, newVariance)) {
              comparisonResult = [...compareArrays(oldVariance, newVariance)];

              // If there are diffs we default to just calculate and update variance
              // record again with the new records we added, just to be sure
              if (comparisonResult.length > 0) {
                // We basically reuse the functions from /activity GET to recalculate
                // the variances (which would have the activities consolidated
                // from the old db by now)
                const theDate = runningDate.toFormat('yyyyLL');
                const currentRecord = await getOne(`${subArea}::${activity}`, theDate);
                let records = await getPreviousYearData(3, subArea, activity, theDate);
                const fields = checkVariances(currentRecord, records, activity);

                // As long as the current record has notes or there are fields
                // (after the variance calculation with the new record),
                // then we create the new variance record and update the new db
                if (fields.length > 0 || currentRecord.notes) {
                  // Essentially same as createVariance in activity /POST handler
                  let record = currentRecord;
                  let subarea = await getOne(`park::${orcs}`, subArea);
                  let bundle = subarea?.bundle;
                  if (bundle === undefined) {
                    bundle = 'N/A';
                  }
                  record.bundle = bundle;

                  const variance = `pk:variance::${orcs}::${theDate} sk: ${subArea}::${activity}`;
                  const oldVarRecord = await getOne(`variance::${orcs}::${theDate}`, `${subArea}::${activity}`);

                  let oldVarFields = [];
                  for (let field of oldVarRecord?.fields) {
                    oldVarFields.push(field);
                  }

                  await logToFile(
                    `Recreating the variance for: ${variance}\n  Park: ${record.parkName},\n  SubArea: ${record.subAreaName},\n  Date: ${theDate},\n  Notes: ${record.notes ? record.notes : ''},\n  Old Record:\n    `,
                    oldVarFields
                  );
                  await logToFile(`  New Record:\n    `, fields);

                  transactionObj.TransactItems.push({
                    Update: {
                      TableName: TABLE_NAME,
                      Key: marshall({ pk: `${comparisonResult[0].pk}`, sk: `${comparisonResult[0].sk}` }),
                      UpdateExpression:
                        'SET #fields = :fields, #resolved = :resolved, #orcs = :orcs, #parkName = :parkName, #subAreaName = :subAreaName, #subAreaId = :subAreaId, #bundle = :bundle, #roles = :roles',
                      ExpressionAttributeNames: {
                        '#fields': 'fields',
                        '#resolved': 'resolved',
                        '#orcs': 'orcs',
                        '#parkName': 'parkName',
                        '#subAreaName': 'subAreaName',
                        '#subAreaId': 'subAreaId',
                        '#bundle': 'bundle',
                        '#roles': 'roles'
                      },
                      ExpressionAttributeValues: marshall(
                        {
                          ':fields': fields,
                          ':resolved': false,
                          ':orcs': record.orcs,
                          ':parkName': record.parkName,
                          ':subAreaName': record.subAreaName,
                          ':subAreaId': record.subAreaId,
                          ':bundle': record.bundle,
                          ':roles': ['sysadmin', `${record.orcs}:${record.subAreaId}`]
                        },
                        { removeUndefinedValues: true }
                      )
                    }
                  });
                }
              }
            }
          } catch (e) {
            await logToFile('Issue with checking variances: ', e);
          }

          runningDate = runningDate.plus({ months: 1 });
          currentDate = runningDate.toFormat('yyyyLL');
        } while (currentDate <= today);
      }
    }
  }

  await executeTransactions(transactionObj);
}

// If there's more than 100 transaction items, then we need to batch them
async function executeTransactions(transactionObj) {
  const multipleTransactObjs = [];

  do {
    let newArr = { TransactItems: [] };
    newArr.TransactItems = transactionObj.TransactItems.splice(0, 99);
    multipleTransactObjs.push(newArr);
  } while (transactionObj.TransactItems.length >= 99);

  // Push the remaining items
  if (transactionObj.TransactItems.length > 0) {
    multipleTransactObjs.push(transactionObj);
  }

  for (const obj of multipleTransactObjs) {
    if (obj.TransactItems.length > 0) {
      try {
        await dynamoClient.send(new TransactWriteItemsCommand(obj));
      } catch (e) {
        console.log('Issue with TransactWriteItemsCommand: ', e);
        break;
      }
    }
  }
}

async function runFixDataDisc() {
  const orcsObj = await getAllOrcs();

  // Check all activities
  await consolidateAllActivities(orcsObj);

  // Check all variances
  await consolidateAllVariances(orcsObj);
}

runFixDataDisc();
