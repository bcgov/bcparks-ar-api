'use strict';
const { TABLE_NAME, dynamodb, getSubAreas } = require('/opt/baseLayer');

//parks to update, section updates to be applied to every subarea within the park
const changes = [
  {
    "ORCS": '0330',
    "section": 'Lower Mainland'
  }
];

let subAreaErrors = []
let completedSubAreas = [];

exports.up = async function (dbOptions) {
  console.log("------------------------------------------------------------------");
  let completedParks = 0;
  for (const park of changes) {
    const section = park.section;

    //get list of subareas for this park
    const subAreas = await getSubAreas(park.ORCS);

    //update section for each subarea
    for (const subArea of subAreas) {
      let data = {
        pk: subArea.pk,
        sk: subArea.sk,
        section: section,
      };

      try {
        await updateSection(data);
        console.log('Updated:', subArea.subAreaName, 'section to', section);
        completedSubAreas.push(subArea.subAreaName);
      } catch (e) {
        console.log('err:', e);
        console.log('Failed to update sub area: ', subArea.subAreaName);
        subAreaErrors.push(subArea.subAreaName);
      }
    }
    completedParks++;
  }
  console.log("------------------------------------------------------------------");
  console.log(`Successfully updated ${completedSubAreas.length} subAreas for`,completedParks,`parks.\n`);
  process.stdout.write(`Failed to update ${subAreaErrors.length} subAreas.\n`);
};

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

  return await dynamodb.updateItem(updateObj);
}
