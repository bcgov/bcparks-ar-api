const { getParks, getSubAreas, TABLE_NAME, dynamodb, runQuery } = require("/opt/baseLayer");
const { marshall } = require("@aws-sdk/util-dynamodb");
const { DateTime } = require('luxon');

const minDate = DateTime.now().set({
  year: 2000,
  month: 1,
  day: 1,
}).setZone('America/Vancouver');

async function updateSubareaName(orcs, oldName, newName) {
  const parks = await getParks();
  let park = parks.find((p) => p.orcs === orcs);
  const subareas = await getSubAreas(orcs);
  let subarea = subareas.find((s) => s.subAreaName === oldName);
  // Running a second time
  if (!subarea) {
    subarea = subareas.find((s) => s.subAreaName === newName);
  }
  const said = subarea?.sk || null;

  // Update Park
  try {
    const saIndex = park.subAreas.findIndex((s) => s.name === oldName);
    if (saIndex > -1) {
      park.subAreas[saIndex].name = newName;
      await marshallAndPutItem(park);
      console.log(`Updated ${orcs} - ${oldName} to ${newName} (Park).`);
    } else {
      console.log(`Already updated ${orcs} - ${oldName} to ${newName} (Park).`);
    }
  } catch (error) {
    console.log(`Failed to update ${orcs} - ${oldName} to ${newName} (Park):`, error);
  }

  // Update subarea
  try {
    if (subarea) {
      const updateItem = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: subarea.pk },
          sk: { S: subarea.sk }
        },
        UpdateExpression: 'SET subAreaName = :subAreaName',
        ExpressionAttributeValues: {
          ':subAreaName': { S: newName }
        }
      };
      await dynamodb.updateItem(updateItem).promise();
      console.log(`Updated ${orcs} - ${oldName} to ${newName} (Subarea).`);
    } else {
      console.log(`Already updated ${orcs} - ${oldName} to ${newName} (Subarea).`);
    }
  } catch (error) {
    console.log(`Failed to update ${orcs} - ${oldName} to ${newName} (Subarea):`, error);
  }

  // update configs
  try {
    if (subarea) {
      const configQuery = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `config::${said}` }
        }
      };
      const configs = await runQuery(configQuery);
      for (let config of configs) {
        config.subAreaName = newName;
        await marshallAndPutItem(config);
      }
      console.log(`Updated ${orcs} - ${oldName} to ${newName} (Configs).`);
    }
  } catch (error) {
    console.log(`Failed to update ${orcs} - ${oldName} to ${newName} (Configs):`, error);
  }

  // variances
  // variance pks include dates, so we either have to scan (very long), or choose a start date to iterate through
  // we will use the latter.
  try {
    for (const activity of subarea.activities.values) {
      const today = DateTime.now().setZone('America/Vancouver').toFormat('yyyyLL');
      let currentDate = minDate.toFormat('yyyyLL');
      let runningDate = minDate;
      do {
        const varianceQuery = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk AND sk = :sk',
          ExpressionAttributeValues: {
            ':pk': { S: `variance::${orcs}::${currentDate}` },
            ':sk': { S: `${said}::${activity}` }
          }
        };
        const variances = await runQuery(varianceQuery);
        if (variances?.length) {
          for (let variance of variances) {
            variance.subAreaName = newName;
            await marshallAndPutItem(variance);
          }
        }
        runningDate = runningDate.plus({ months: 1 });
        currentDate = runningDate.toFormat('yyyyLL');
      } while (currentDate <= today);
    }
    console.log(`Updated ${orcs} - ${oldName} to ${newName} (Variances).`);
  } catch (error) {
    console.log(`Failed to update ${orcs} - ${oldName} to ${newName} (Variancess):`, error);
  }

  // activity records
  try {
    for (const activity of subarea?.activities?.values) {
      const activityGet = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `${said}::${activity}` }
        }
      };
      const records = await runQuery(activityGet);
      for (let record of records) {
        record['subAreaName'] = newName;
        if (record?.config?.subAreaName) {
          record.config.subAreaName = newName;
        }
        await marshallAndPutItem(record);
      }
    }
    console.log(`Updated ${orcs} - ${oldName} to ${newName} (Activity Records).`);
  } catch (error) {
    console.log(`Failed to update ${orcs} - ${oldName} to ${newName} (Activity records):`, error);
  }
}

async function marshallAndPutItem(item) {
  try {
    const putItem = {
      TableName: TABLE_NAME,
      Item: marshall(item),
    };
    await dynamodb.putItem(putItem).promise();
  } catch {
    throw 'failed to put item';
  }
}

module.exports = {
  updateSubareaName,
  marshallAndPutItem
};
