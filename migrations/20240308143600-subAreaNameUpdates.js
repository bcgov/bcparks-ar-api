const { TABLE_NAME, getSubAreas, dynamodb } = require("/opt/baseLayer");
const { updateSubareaName, marshallAndPutItem } = require("../migrations-data/updateSubareaName");


// update Diamond Head Subarea in Garibaldi to have the Backcountry Cabins activity
async function updateDiamondHead() {
  const subareas = await getSubAreas('0007');
  let diamondHead = subareas.find((s) => s.subAreaName === 'Diamond Head');
  const said = diamondHead.sk;
  // add activity to subarea
  try {
    // get subarea
    let activities = diamondHead.activities.values;
    if (activities.indexOf('Backcountry Cabins') === -1) {
      activities.push('Backcountry Cabins');
      const activityUpdate = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: diamondHead.pk },
          sk: { S: diamondHead.sk }
        },
        UpdateExpression: 'SET activities = :activities',
        ExpressionAttributeValues: {
          ':activities': { SS: activities }
        }
      };
      await dynamodb.updateItem(activityUpdate).promise();
      console.log('Updated Diamond Head activity');
    } else {
      console.log('Diamond Head already updated.');
    }
  } catch (error) {
    console.log('Failed to update Diamond Head with Backcountry Cabins');
    console.log('error:', error);
  }

  // add Diamond Head Backcountry Cabins config
  try {
    const item = {
      pk: `config::${said}`,
      sk: 'Backcountry Cabins',
      subAreaId: said,
      parkName: diamondHead.parkName,
      orcs: diamondHead.orcs,
      attendanceModifier: 3.2,
      subAreaName: diamondHead.subAreaName,
    };
    await marshallAndPutItem(item);
    console.log('Diamond Head config object created.');
  } catch (error) {
    console.log('Failed to update Diamond Head config object');
    console.log('error:', error);
  }
}

updateSubareaName('0007', 'Garibaldi Lake', 'Rubble Creek');
updateSubareaName('0041', 'Cultus East Group Use', 'Honeymoon Bay Group');
updateSubareaName('0041', 'Cultus West Group Use', 'Westside Group');
updateDiamondHead();
