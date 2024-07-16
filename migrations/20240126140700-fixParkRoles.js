const { TABLE_NAME, getParks, dynamodb } = require('/opt/baseLayer');
const AWS = require('aws-sdk');

async function fixSubAreaRoles() {
  const parks = await getParks();
  for (const park of parks) {
    try {
      const roles = {
        L: [
          {
            S: 'sysadmin'
          },
          {
            S: park.orcs
          }
        ]
      }
      let updateObj = {
        TableName: TABLE_NAME,
        Key: {
          pk: { S: park.pk },
          sk: { S: park.sk },
        },
        UpdateExpression: 'set #roles = :roles',
        ExpressionAttributeValues: {
          ':roles': roles,
        },
        ExpressionAttributeNames: {
          '#roles': 'roles'
        }
      }
      await dynamodb.updateItem(updateObj).promise();
      console.log('Park', park.sk, 'has been fixed.');
    } catch (error) {
      console.log('An error occured while fixing park', park.sk);
      console.log(error);
      throw 'exiting';
    }
  }
}

fixSubAreaRoles();
