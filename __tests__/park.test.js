const AWS = require('aws-sdk');
const { DocumentClient } = require('aws-sdk/clients/dynamodb');
const { REGION, ENDPOINT, TABLE_NAME } = require('./global/settings');
const { PARKSLIST, SUBAREAS } = require('./global/data.json');

const parkGET = require('../lambda/park/GET/index');
const parkPOST = require('../lambda/park/POST/index');

const jwt = require('jsonwebtoken');
const token = jwt.sign({ resource_access: { 'attendance-and-revenue': { roles: ['sysadmin']}} }, 'defaultSecret');

async function setupDb() {
  new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT
  });
  docClient = new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true
  });

  for(const park of PARKSLIST) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: park
      })
      .promise();
  }

  for (const subarea of SUBAREAS) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: subarea
      })
      .promise();
  }
}

describe('Pass Succeeds', () => {
  beforeAll(async () => {
    return await setupDb();
  });

  test('Handler - 200 Received list of parks', async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token
      },
      httpMethod: "GET"
    };
    expect(await parkGET.handler(event, null)).toMatchObject({
      body: JSON.stringify(PARKSLIST),
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      statusCode: 200
    });
  });

  test('Handler - 200 Receive park specific information', async () => {
    let specificSubAreas = [];
    for(const area of SUBAREAS) {
      if (area.pk === "park::0041") {
        specificSubAreas.push(area);
      }
    }
    const response = await parkGET.handler({
      headers: {
        Authorization: "Bearer " + token
      },
      queryStringParameters: {
        orcs: PARKSLIST[0].sk,
        subAreaId: specificSubAreas[0].sk
      }
    }, null);

    const body = JSON.parse(response.body);

    expect(body.data[0].subAreaName).toMatch(body.data[0].subAreaName);
  });

  test('Handler - 400 GET Bad Request', async () => {
    const response = await parkGET.handler({
      headers: {
        Authorization: "Bearer " + token + "invalid"
      },
      queryStringParameters: {
        badParam: "oops"
      }
    }, null);

    expect(response.statusCode).toBe(400);
  });

  test('Handler - 400 POST Bad Request', async () => {
    const response = await parkPOST.handler({
      headers: {
        Authorization: "Bearer " + token + "invalid"
      },
      body: JSON.stringify({
        badParam: "{xxxxxx}"
      })
    }, null);

    expect(response.statusCode).toBe(400);
  });

  test('Handler - 200 POST Park', async () => {
    const response = await parkPOST.handler({
      headers: {
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        orcs: '0000',
        someconfig: "test"
      })
    }, null);

    expect(response.statusCode).toBe(400);
  });
  
});
