const { 
  calculateVariance,
  dynamoClient,
  getOne,
  incrementAndGetNextSubAreaID,
  marshall,
  runQuery,
  TABLE_NAME,
  TransactWriteItemsCommand,
} = require('../layers/baseLayer/baseLayer.js');
const { EXPORT_VARIANCE_CONFIG } = require('../layers/constantsLayer/constantsLayer.js')
const { DateTime } = require('luxon');

async function checkMarineSiteExists(parkId) {
  const park = await getOne('park', parkId);
  const marineSiteExists = park.subAreas.find(subArea => subArea.name === 'Marine Sites');
  if (!marineSiteExists) {
    throw "Subarea doesn't exist in Park - have you run a POST request on /subarea?";
  }

  console.log('New subarea exists, continuing...');
  return marineSiteExists.id;
}

// Update the park::0001 subareas attribute for the retiring the old subareas
async function updateParkSubAreas(oldSubAreaIds, parkId) {
  console.log('Finding the park...');
  transactionObj = { TransactItems: [] };

  const park = await getOne('park', parkId);
  const oldSubAreaSet = new Set(oldSubAreaIds);
  
  // for each old subarea id, add isLegacy and add (historic) to name
  let updatedParkSubAreas = park.subAreas.map(subArea => {
    if (oldSubAreaSet.has(subArea.id)) {
      return { ...subArea, name: `${subArea.name} (historic)`, isLegacy: true };
    }

    return subArea;
  });

  // A QoL to sort areas alphabetically, otherwise Marine Sites ends up at the
  // bottom of the subArea list below historical subareas, and the old subareas
  // are not grouped with the historical subareas
  updatedParkSubAreas.sort((a, b) => {
      // Check if isLegacy (historical), if undefined then set as false for this
      const aIsLegacy = !!a.isLegacy;
      const bIsLegacy = !!b.isLegacy;

      // isLegacy always comes second
      if (aIsLegacy !== bIsLegacy) {
          return aIsLegacy ? 1 : -1;
      }

      // Sort alphabetically by name otherwise
      return a.name.localeCompare(b.name);
  });

  transactionObj.TransactItems.push({
    Update: {
      TableName: TABLE_NAME,
      Key: {
        pk: { S: 'park' },
        sk: { S: parkId }
      },
      UpdateExpression: 'SET #subAreas = :subAreas',
      ExpressionAttributeNames: {
        '#subAreas': 'subAreas'
      },
      ExpressionAttributeValues: {
        ':subAreas': { L: marshall(updatedParkSubAreas) }
      }
    }
  })

  console.log('Updating park subareas...');
  await executeTransactions(transactionObj);  
}

// Need to loop through the activity records by date in the sk. This will
// mean that all records for 202309 for each subarea are amalgamated into
// one super duper record
async function createNewSubAreaActivities(oldSubAreaIds, marineSubAreaId) {
  console.log('Looping through old subareas...');
  let transactionObj = { TransactItems: [] };

  const minDate = DateTime.now().set({ year: 2016, month: 1, day: 1 }).setZone('America/Vancouver');
  const today = DateTime.now().setZone('America/Vancouver').toFormat('yyyyLL');
  let currentDate = minDate.toFormat('yyyyLL');
  let runningDate = minDate;

  do {
    let transactionObjExists = false;
    
    // All records will be consolidated, so add people and grossCampingRevenue
    // if they exist. Other data items will be the same attribute updates.
    let marineSiteActivity = {
      pk: `${marineSubAreaId}::Backcountry Camping`,
      sk: `${currentDate}`,
      subAreaId: `${marineSubAreaId}`,
      parkName: 'Strathcona',
      orcs: '0001',
      subAreaName: 'Marine Sites',
      config: {
        pk: `${marineSubAreaId}::Backcountry Camping`,
        sk: `${currentDate}`,
        subAreaId: `${marineSubAreaId}`,
        parkName: 'Strathcona',
        orcs: '0001',
        subAreaName: 'Marine Sites'
      },
      activity: 'Backcountry Camping',
      date: `${currentDate}`,
      isLocked: true,
      lastUpdated: '',
    };

    for (const oldSubAreaId of oldSubAreaIds) {
      const activityQuery = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk AND sk = :sk',
        ExpressionAttributeValues: {
          ':pk': { S: `${oldSubAreaId}::Backcountry Camping` },
          ':sk': { S: `${currentDate}` }
        }
      };
      const activities = await runQuery(activityQuery);

      if (activities?.length) {
        transactionObjExists = true;

        for (const activity of activities) {
          // Add up the people and grossCampingRevenue if they exist
          if (activity.people) {
            if (marineSiteActivity.people !== undefined) {
              marineSiteActivity.people += activity.people
            } else {
              marineSiteActivity.people = activity.people
            }
          }

          if (activity.grossCampingRevenue) {
            if (marineSiteActivity.grossCampingRevenue !== undefined) {
              marineSiteActivity.grossCampingRevenue += activity.grossCampingRevenue
            } else {
              marineSiteActivity.grossCampingRevenue = activity.grossCampingRevenue
            }
          }

          // Add isLegacy true if it's before 2022
          if ((parseInt(currentDate.slice(0, 4), 10)) < 2022) {
            marineSiteActivity.isLegacy = true;
          }

          // If one of the old subarea records is locked, then lock new record
          if (activity.isLocked) {
            marineSiteActivity.isLocked = activity.isLocked;
          }
            
          // Add today as lastUpdated, because that's just true (and
          // because there will be several different lastUpdated times)
          marineSiteActivity.lastUpdated = new Date().toISOString();
        }
      }
    }
   
    if (transactionObjExists) {
      transactionObj.TransactItems.push({
        Put: {
          TableName: TABLE_NAME,
          Item: marshall(marineSiteActivity),
          ConditionExpression: 'attribute_not_exists(sk)',
        }
      });
    };
    
    runningDate = runningDate.plus({ months: 1 });
    currentDate = runningDate.toFormat('yyyyLL');
  } while (currentDate <= today);
  
  console.log('Creating new subarea activities...');
  await executeTransactions(transactionObj);
}

// Lock the old subarea activity records so they can't be altered moving forward
async function updateOldSubAreaActivities(oldSubAreaIds, marineSubAreaId) {
  console.log('Looping through old subareas again...');
  let transactionObj = { TransactItems: [] };

  // set all old subarea records to be locked 
  for (const oldSubAreaId of oldSubAreaIds) {
    const activityQuery = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `${oldSubAreaId}::Backcountry Camping` },
      }
    };
    
    const activities = await runQuery(activityQuery);

    // Loop through all the records found and set to locked and legacy
    if (activities?.length) {
      for (const activity of activities) {
        transactionObj.TransactItems.push({
          Update: {
            TableName: TABLE_NAME,
            Key: {
              pk: { S: activity.pk },
              sk: { S: activity.sk }
            },
            UpdateExpression: 'SET #isLocked = :isLocked, #isLegacy = :isLegacy',
            ExpressionAttributeNames: {
              '#isLocked': 'isLocked',
              '#isLegacy': 'isLegacy'
            },
            ExpressionAttributeValues: {
              ':isLocked': { BOOL: true },
              ':isLegacy': { BOOL: true }
            }
          }
        })
      } 
    }
  }
  
  console.log('Updating old subarea activities...');
  await executeTransactions(transactionObj);
}

// Write all items to the database
async function executeTransactions(obj) {
  try {
    await dynamoClient.send(new TransactWriteItemsCommand(obj));
  } catch(e) {
    console.log('Error with executing transaction: ', e);
  }
  
  console.log('Done!');
}

async function updateToMarineSiteSubAreas() {
  try {
    const parkId = '0001';
    const oldSubAreaIds = ['0415', '0417', '0418', '0424', '0425'];

    // Check if new subarea has been generated, get the new subarea id
    const marineSubAreaId = await checkMarineSiteExists(parkId);

    // Update { pk: park, sk:0001} so the old subareas have { isLegacy: true }
    await updateParkSubAreas(oldSubAreaIds, parkId); 
    
    // Amalgamate old activity records for each year into one super record
    await createNewSubAreaActivities(oldSubAreaIds, marineSubAreaId);

    // Update the old activity records to be locked and legacy
    await updateOldSubAreaActivities(oldSubAreaIds, marineSubAreaId);

  } catch (e) {
    console.log('Error with migration: ', e);
  }
};

updateToMarineSiteSubAreas();
