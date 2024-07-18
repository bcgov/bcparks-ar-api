const AWS = require('aws-sdk');
const {
  getValidSubareaObj,
  createUpdateParkWithNewSubAreaObj,
  createPutSubAreaObj,
} = require("/opt/subAreaLayer");
const region = 'localhost';
const { TABLE_NAME, dynamodb, runQuery, getSubAreas } = require('/opt/baseLayer');

let endpoint;
if (region === 'localhost') {
  endpoint = 'http://localhost:8000';
}

AWS.config.update({
    region: region,
    endpoint: endpoint, 
  });

const dynamoDb = new AWS.DynamoDB.DocumentClient({ 
  region: region,
  endpoint: endpoint,
});


exports.up = async function(oldORC, newORC, newParkName){
    await convertPark(oldORC, newORC, newParkName)
    await deleteOldPark(oldORC)
  }
async function deleteOldPark(oldORC){
  //Deletes all the items that could not be updated: Park, SubAreas, and Variances
  console.log("Attempting to delete: ", oldORC)
  const parkData = await getPark(oldORC);
  if (parkData.length > 0) {
    const subAreaList = await getSubAreas(oldORC);
    for (const area of subAreaList){
      const activityList = area.activities.values;
      for (const activity of activityList){
        const recordsList = await getActivityRecords(area, activity);
        for (const record of recordsList) {
          const varianceList = await getVariances(record, oldORC);
          await deleteVariance(varianceList, record.pk);
        }
      }
      await deleteSubArea(area.pk, area.sk);
    }
    await deletePark(oldORC);
  } else {
    console.log("Could not delete ", oldORC, " as it does not exist.")
  }
 
}

async function deletePark(oldORC){
  try{
    console.log("Deleting Park: ", oldORC);
    const deletePark = {
      TableName: TABLE_NAME,
      Key: {
        pk: {S: "park" },
        sk: {S: oldORC }
      },
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
    };
    await dynamodb.deleteItem(deletePark).promise();
  }catch (error){
    console.log("Failed to delete park ", oldORC);
    console.log(error);
  }
}

async function getPark(orc) {
  const getPark = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
          ":pk": { S: `park::${orc}` },
      },
  };
const park = await runQuery(getPark);
return park;
}

async function deleteSubArea(pk, sk){
  try{
    console.log("Deleting Subarea: ", pk, ":", sk);
    const deleteSubArea = {
      TableName: TABLE_NAME,
      Key: {
        pk: {S: pk },
        sk: {S: sk }
      },
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
    };
    await dynamodb.deleteItem(deleteSubArea).promise();
  }catch (error){
    console.log("Failed to delete sub area: ", pk, " ", sk);
    console.log(error);
  }
}

async function deleteVariance(varianceList, recordPK){
  try{
    if(varianceList.length > 0){
      for(const variance of varianceList){
        console.log("Deleting Variance: ", variance.pk);
        const deleteVariance = {
          TableName: TABLE_NAME,
          Key: {
            pk: {S: variance.pk},
            sk: {S: variance.sk}
          },
          ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        };
        await dynamodb.deleteItem(deleteVariance).promise();
      }
    } else {
      console.log("There are no variances to delete for record: ", recordPK)
    }
  }catch(error){
    console.log("Failed to delete variance for: ", recordPK);
    console.log(error);
  }
}

async function convertPark(oldORC, newORC, newParkName){
  // Takes old park number and info to update it with. 
  // Will Create a new park, Re-create all subareas from old park and add them to the new park.
  // For each Subarea in the old park it will find all config files for the activities and update to new Park.
  // Creates new variance reports for each activity 
  // Updates the activity records for which those variances reference. 
  
  try {
    console.log("Creating new park: ", newParkName);
    await createNewPark(newORC, newParkName);
    const subAreaList = await getSubAreas(oldORC);
    console.log("Creating the new subareas for: ", newORC);
    await addSubAreas(subAreaList, newORC, newParkName);
    
    for(const area of subAreaList){ 
      console.log("Checking For Configs: ", area.pk, ":", area.sk); 
      const activityList = area.activities.values
      for(const activity of activityList){
        const config = await getConfigs(area); 
        if(config.parkName && config.parkName != newParkName){
          console.log("Updating config: ", activity, " for ", area.subAreaName);
          await updateConfig(config, newORC, newParkName);
        }
      }
      for (const activity of activityList){
        const recordsList = await getActivityRecords(area, activity);
        for (const record of recordsList) {
          const varianceList = await getVariances(record, oldORC);
          await createVariance(varianceList, record.date, newORC, newParkName);
          await updateRecord(record, newORC);
        }
      }
    }
  }
  catch (error) {
    console.error('Error:', error);
  }
}

async function createVariance(varianceList, date, newORC, newParkName){
  try{
    for(const variance of varianceList){
      console.log("Re-creating variance: ", variance.pk);
      const newVariance = {
        TableName: TABLE_NAME,
        ConditionExpression: "attribute_not_exists(pk)",
        Item: {
            pk: { S: `variance::${newORC}::${date}` },
            sk: { S: `${variance.sk}` },
            orcs: { S: `${newORC}` },
            parkName: { S: `${newParkName}` },
            roles: { L: [{S: "sysadmin"}, {S: `${newORC}:${variance.subAreaId}`}] },
            bundle: { S: `${variance.bundle}`},
            subAreaName:{ S: variance.subAreaName },
            subAreaId: { S: variance.subAreaId },
            notes: { S: variance.notes },
            resolved: {BOOL: variance.resolved },
        },
      }
      if (variance.fields && variance.fields.length != 0) {
        newVariance.Item.fields = { SS: variance.fields };
      }
      await dynamodb.putItem(newVariance).promise();
    }
  } catch (error){
    if (error.code === "ConditionalCheckFailedException") {
      console.log("Variance already exists: ", variance.pk);
    } else {
        console.log("Error creating variance:", variance.pk);
        console.log(error);
    }
  }
}

async function updateRecord(record, newORC){
  try {
    const updateRecord = {
      TableName: TABLE_NAME,
      Key: { 
        pk: { S: `${record.subAreaId}::${record.activity}` },
        sk: { S: `${record.date}` }
      },
      ExpressionAttributeValues: { 
        ':newOrc': { S: `${newORC}` },
        ':newParkName': {S: `${newParkName}`} 
      },
      ExpressionAttributeNames: { 
        '#orcs': 'orcs',
        '#parkName': 'parkName' 
      },
      UpdateExpression: 'set #orcs = :newOrc, #parkName =:newParkName',
      ReturnValues: 'ALL_NEW', 
      ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)' 
    };    
    await dynamodb.updateItem(updateRecord).promise();
  } catch (error) {
    console.log('Error updating item:', error);
  }
}

async function updateConfig(config, newORC, newParkName){
  try {
      const updateConfig = {
        TableName: TABLE_NAME,
        Key: { pk: { S: `config::${config[0].subAreaId}` }, sk: { S: `${config[0].sk}` } },
        ExpressionAttributeValues: { 
          ':newOrcs': { S: `${newORC}` }, 
          ':newParkName': {S: `${newParkName}`} 
        },
        ExpressionAttributeNames: { 
          '#orcs': 'orcs',
          '#parkName': 'parkName' 
        },
        
        UpdateExpression: 'set #orcs = :newOrcs, #parkName =:newParkName',
        ReturnValues: 'ALL_NEW',
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
      };
      const { Attributes } = await dynamodb.updateItem(updateConfig).promise();
      return Attributes;  
 
  } catch (error) {
    console.log("Error updating: ", config.pk);
    console.log(error);
  }
}

async function createNewPark(newORC, newParkName){
  try {
    const newPark = {
        TableName: TABLE_NAME,
        ConditionExpression: "attribute_not_exists(sk)",
        Item: {
            pk: { S: 'park' },
            sk: { S: newORC },
            orcs: { S: newORC },
            parkName: { S: newParkName },
            isLegacy: { BOOL: false },
            roles: { SS: ["sysadmin", newORC] },
            subAreas: { L: [] },
        },
    };
    await dynamodb.putItem(newPark).promise();
  } catch (error) {
      if (error.code === "ConditionalCheckFailedException") {
          console.log("Park already exists");
      } else {
          console.log("Error creating park:", newParkName);
          console.log(error);
      }
  }
}

async function addSubAreas(oldSubAreaList, newORC, newParkName){
  try {
      // This needs to makesure the newORC doesnt already have the subareas.
      // Once that is confirmed create the object
      // Add info to the park
      // Create the actual subarea
      const newSubAreaList = await getSubAreas(newORC);
      for (const area of oldSubAreaList){
        if (newSubAreaList.some(obj => obj.sk === area.sk)) {
          console.log('The subarea ', area.sk, " already exists for ", newORC);
          continue;
        }
        console.log("Creating subAreaName: ", area.subAreaName, " for ", newORC);
        const newSubAreaOBJ = {
            activities: area.activities.values,
            orcs: newORC,
            managementArea: area.managementArea || " ",
            section: area.section,
            region: area.region,
            bundle: area.bundle,
            subAreaName: area.subAreaName
        };
        let subAreaObj = getValidSubareaObj(newSubAreaOBJ, newParkName);
        let transactionObj = { TransactItems: [] };
        transactionObj.TransactItems.push({
            Update: createUpdateParkWithNewSubAreaObj(
                subAreaObj.subAreaName,
                area.sk,
                subAreaObj.isLegacy,
                subAreaObj.orcs
            ),
        });
        transactionObj.TransactItems.push({
            Put: createPutSubAreaObj(subAreaObj, area.sk, newParkName),
        });
        await dynamodb.transactWriteItems(transactionObj).promise();
      }
    } catch (error) {
      console.error("Error adding subarea:", error);
    }
  }
    
async function getConfigs(subArea) {
  const subAreaID = subArea.sk;
  const getConfigsQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: {
      ":pk": { S: `config::${subAreaID}` },
    },
  };
  const config = await runQuery(getConfigsQuery);
  return config;
}

async function getActivityRecords(subArea, activity) {
  const subAreaId = subArea.sk;
  let activityRecords = [];
  const getActivitiesQuery = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: {
          ":pk": { S: `${subAreaId}::${activity}` },
      },
  };
activityRecords = await runQuery(getActivitiesQuery);
return activityRecords;
}
  
async function getVariances(record, ORC) {
  const date = record.date;
  const subAreaId = record.subAreaId;
  const activity = record.activity;
  const getVariancesQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND sk = :sk",
    ExpressionAttributeValues: {
      ":pk": { S: `variance::${ORC}::${date}` },
      ":sk": { S: `${subAreaId}::${activity}` },
    },
  };
  return await runQuery(getVariancesQuery);
}

const migrationName = 'updateORCS3883.js';
const oldORC = '0281';
const newORC = '3883';
const newParkName = 'Tsútswecw Park';

exports.down = async function () {};
exports.up(oldORC, newORC, newParkName);
