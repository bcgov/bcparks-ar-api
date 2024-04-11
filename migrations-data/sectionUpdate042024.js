const AWS = require('aws-sdk');
const region =  process.env.AWS_REGION || 'localhost';
const { TABLE_NAME, dynamodb, getSubAreas } = require('../lambda/dynamoUtil');

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

const migrationName = 'sectionUpdate3.js';
const changes = [
{
  "ORCS": '0330',
  "section": 'Thompson Cariboo'
},
{
  "ORCS": '0220',
  "section": 'North Coast'
},
];
exports.up = async function(){
  try {
    let subAreaErrors = [];
    let completedSubAreas = [];
    console.log('------------------------------------------------------------------');
    let completedParks = 0;
    for (const park of changes) {
      const section = park.section;
      const subAreas = await getSubAreas(park.ORCS);
      for (const subArea of subAreas) {
        let data = {
          pk: subArea.pk,
          sk: subArea.sk,
          section: section,
        };
        try {
          console.log("Trying park number:", completedParks)
          await updateSection(data);
          console.log(park.ORCS,': Updated:', subArea.subAreaName, 'section to', section);
          completedSubAreas.push(subArea.subAreaName);
        } catch (e) {
          console.log('err:', e);
          console.log('Failed to update sub area: ', subArea.subAreaName);
          subAreaErrors.push(subArea.subAreaName);
        }
      }
      completedParks++;
    }
    console.log('------------------------------------------------------------------');
    console.log(`Successfully updated ${completedSubAreas.length} subAreas for`, completedParks, 'parks.\n');
    process.stdout.write(`Failed to update ${subAreaErrors.length} subAreas.\n`);
  } catch (error) {
    console.error('Error during migration:', error);
  }
}
async function updateSection(data) {
  const updateObj = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
    Key: {
      pk: { S: `${data.pk}` },
      sk: { S: `${data.sk}` },
    },
    UpdateExpression: 'set #section = :section',
    ExpressionAttributeNames: {
      '#section': 'section',
    },
    ExpressionAttributeValues: {
      ':section': { S: data.section },
    },
  };
  return await dynamodb.updateItem(updateObj).promise();
}
exports.down = async function () {};
exports.up();