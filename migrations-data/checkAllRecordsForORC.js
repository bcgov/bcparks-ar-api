const AWS = require('aws-sdk');
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

exports.up = async function(oldORC){
    try {
        console.log("Checking for park: park::", oldORC);
        const parkData = await getPark(oldORC);
        if(parkData.length > 0){
            console.log("Park exists: ", oldORC);
            console.log("Checking for subareas of: ", oldORC)
            hasSubAreas(oldORC);   
        }else{
            console.log("Park does not exist: ", oldORC);
        }
    }
    catch (error) {
        console.error('Error:', error);
    }    
}
async function hasSubAreas(oldORC){
    const subAreaList = await getSubAreas(oldORC);
    if (subAreaList.length > 0){
        console.log(oldORC, " Has subAreas.")
        for(const area of subAreaList){     
            console.log("Subarea exists: ", area.pk, "::", area.sk)
            printConfigs(area);
            printRecords(area, oldORC);
        }
    }else{
        console.log(oldORC, " Has no subAreas.")
    }
}

async function printRecords(area, oldORC){
    const activityList = area.activities.values 
    for ( const activity of activityList ) {
        const recordsList = await getActivityRecords(area, activity);
        if(recordsList.length > 0){
            console.log(area.pk,"::", area.sk, " Has records.")
            for (const record of recordsList) {
                console.log("Record exists", record.pk, " ", record.sk)
                printVariance(record, oldORC);                    
            }
        }
    }
}

async function printVariance(record, oldORC){
    const varianceList = await getVariances(record, oldORC);
    for (const variance of varianceList){
        console.log("Variance exists: ", variance.pk, " ", variance.sk)
    }    
}
async function printConfigs(area){
    const activityList = area.activities.values           
    for( activity of activityList ) {
        const config = await getConfigs(area);
        if(config.length > 0){
            console.log("Config exists: config::", area.sk)
        }
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
      ":sk": { S: `${subAreaId}::${activity}`},
    },
  };
  return await runQuery(getVariancesQuery);
}

if (process.argv.length != 3){
    console.log("Exactly one ORC Number is needed for search.");
    process.exit(1);
}

exports.down = async function () {};
exports.up(process.argv[2]);
