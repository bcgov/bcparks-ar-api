const AWS = require('aws-sdk');
const region =  process.env.AWS_REGION || 'localhost';
const { TABLE_NAME, dynamodb, getSubAreas } = require('/opt/baseLayer');

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

const migrationName = 'sectionUpdate2.js';
const changes = [
{
  "ORCS": '0117',
  "section": 'South Island'
},
{
  "ORCS": '0165',
  "section": 'South Island'
},
{
  "ORCS": '0383',
  "section": 'South Island'
},
{
  "ORCS": '9554',
  "section": 'South Island'
},
{
  "ORCS": '9868',
  "section": 'South Island'
},
{
  "ORCS": '6161',
  "section": 'South Island'
},
{
  "ORCS": '9869',
  "section": 'South Island'
},
{
  "ORCS": '0384',
  "section": 'South Island'
},
{
  "ORCS": '0237',
  "section": 'South Island'
},
{
  "ORCS": '0210',
  "section": 'South Island'
},
{
  "ORCS": '0262',
  "section": 'South Island'
},
{
  "ORCS": '0096',
  "section": 'South Island'
},
{
  "ORCS": '9229',
  "section": 'South Island'
},
{
  "ORCS": '0106',
  "section": 'South Island'
},
{
  "ORCS": '9398',
  "section": 'South Island'
},
{
  "ORCS": '0045',
  "section": 'North Island'
},
{
  "ORCS": '0003',
  "section": 'South Island'
},
{
  "ORCS": '0104',
  "section": 'South Island'
},
{
  "ORCS": '0529',
  "section": 'South Island'
},
{
  "ORCS": '0198',
  "section": 'South Island'
},
{
  "ORCS": '0267',
  "section": 'South Island'
},
{
  "ORCS": '0133',
  "section": 'Mid Island Haida Gwaii'
},
{
  "ORCS": '0021',
  "section": 'South Island'
},
{
  "ORCS": '0048',
  "section": 'Mid Island Haida Gwaii'
},
{
  "ORCS": '0250',
  "section": 'North Island'
},
{
  "ORCS": '0028',
  "section": 'North Island'
},
{
  "ORCS": '0189',
  "section": 'North Island'
},
{
  "ORCS": '0382',
  "section": 'South Island'
},
{
  "ORCS": '0182',
  "section": 'Mid Island Haida Gwaii'
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
