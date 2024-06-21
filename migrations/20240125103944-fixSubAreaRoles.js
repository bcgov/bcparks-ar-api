const { TABLE_NAME, getParks, dynamodb } = require('/opt/baseLayer');

async function fixSubAreaRoles() {
  const parks = await getParks();
  for (const park of parks) {
    const subAreas = await getUnmarshalledSubAreas(park.orcs);
    subAreas.forEach(async (subArea) => {
      subArea.roles = {
        L: [
          {
            S: 'sysadmin',
          },
          {
            S: `${subArea.orcs.S}:${subArea.sk.S}`,
          },
        ],
      };
      let params = {
        TableName: TABLE_NAME,
        ConditionExpression: 'attribute_exists(pk) AND attribute_exists(sk)',
        Key: {
          pk: subArea.pk,
          sk: subArea.sk,
        },
        UpdateExpression: 'set #roles = :roles',
        ExpressionAttributeValues: {
          ':roles': subArea.roles,
        },
        ExpressionAttributeNames: {
          '#roles': 'roles',
        },
      };

      try {
        await dynamodb.updateItem(params).promise();
        console.log('Subarea', subArea.sk, 'has been fixed.');
      } catch (error) {
        console.log('An error occured while fixing subarea', subArea.sk);
        console.log(error);
      }
    });
  }
}

async function getUnmarshalledSubAreas(orcs, includeLegacy = true) {
  const subAreaQuery = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: `park::${orcs}` },
    },
  };
  if (!includeLegacy) {
    subAreaQuery.FilterExpression = 'isLegacy = :legacy OR attribute_not_exists(isLegacy)';
    subAreaQuery.ExpressionAttributeValues[':legacy'] = { BOOL: false };
  }
  return (await dynamodb.query(subAreaQuery).promise()).Items;
}

fixSubAreaRoles();
