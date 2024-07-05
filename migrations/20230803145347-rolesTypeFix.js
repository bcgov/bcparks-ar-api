'use strict';
const AWS = require('aws-sdk');
const { TABLE_NAME, getParks, dynamodb } = require('../lambda/dynamoUtil');

exports.up = async function (dbOptions) {
  const parks = await getParks();
  let subAreasToFix = [];

  for (const park of parks) {
    const subAreas = await getUnmarshalledSubAreas(park.orcs);
    subAreas.forEach((subArea) => {
      if (subArea.roles && subArea.roles.SS) {
        subAreasToFix.push(subArea);
      }
    });
  }

  console.log(subAreasToFix.length, 'subareas to fix.');

  for (let subArea of subAreasToFix) {
    let list = [];
    for (const role of subArea.roles.SS) {
      list.push({
        S: role,
      });
    }
    subArea.roles = { L: list };

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
  }
};

exports.down = async function (dbOptions) {};

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
