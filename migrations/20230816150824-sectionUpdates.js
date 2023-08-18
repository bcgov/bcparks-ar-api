'use strict';
const AWS = require('aws-sdk');
const { TABLE_NAME, dynamodb, getSubAreas } = require('../lambda/dynamoUtil');

//parks to update, section updates to be applied to every subarea within the park
const changes = [
  {
    "ORCS": '0030',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0269',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '9504',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0050',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0564',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0255',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0321',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0560',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0187',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0292',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0377',
    "section": 'North Island'
  },
  {
    "ORCS": '0283',
    "section": 'North Island'
  },
  {
    "ORCS": '9512',
    "section": 'North Island'
  },
  {
    "ORCS": '6093',
    "section": 'North Island'
  },
  {
    "ORCS": '0264',
    "section": 'North Island'
  },
  {
    "ORCS": '0045',
    "section": 'North Island'
  },
  {
    "ORCS": '0131',
    "section": 'North Island'
  },
  {
    "ORCS": '0265',
    "section": 'North Island'
  },
  {
    "ORCS": '0109',
    "section": 'North Island'
  },
  {
    "ORCS": '0243',
    "section": 'North Island'
  },
  {
    "ORCS": '0367',
    "section": 'North Island'
  },
  {
    "ORCS": '0190',
    "section": 'North Island'
  },
  {
    "ORCS": '0087',
    "section": 'North Island'
  },
  {
    "ORCS": '0313',
    "section": 'North Island'
  },
  {
    "ORCS": '0001',
    "section": 'North Island'
  },
  {
    "ORCS": '0295',
    "section": 'South Island'
  },
  {
    "ORCS": '9867',
    "section": 'South Island'
  },
  {
    "ORCS": '0382',
    "section": 'South Island'
  },
  {
    "ORCS": '0182',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0031',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0296',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0039',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0231',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0043',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0193',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0301',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0366',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0226',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0029',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0118',
    "section": 'Mid Island Haida Gwaii'
  },
  {
    "ORCS": '0310',
    "section": 'Mid Island Haida Gwaii'
  },
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

  return await dynamodb.updateItem(updateObj).promise();
}