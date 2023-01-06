const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const { REGION, ENDPOINT, TABLE_NAME } = require("./global/settings");
const { PARKSLIST, SUBAREAS } = require("./global/data.json");

const exportGET = require("../lambda/export/GET/index");

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");


async function setupDb() {
  new AWS.DynamoDB({
    region: REGION,
    endpoint: ENDPOINT,
  });
  docClient = new DocumentClient({
    region: REGION,
    endpoint: ENDPOINT,
    convertEmptyValues: true,
  });

  for (const park of PARKSLIST) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: park,
      })
      .promise();
  }

  for (const subarea of SUBAREAS) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: subarea,
      })
      .promise();
  }
}

describe("Export Report", () => {
  beforeAll(async () => {
    return await setupDb();
  });

  test("Handler - 200 GET request (no params)", async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
    };

    const result = await exportGET.handler(event, null)

    expect(result).toEqual(
      expect.objectContaining({
        headers: {
          "Access-Control-Allow-Headers":
            "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
          "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        statusCode: 200,
      })
    );
  });

  test("Handler - 403 GET Invalid Auth", async () => {
    const response = await exportGET.handler(
      {
        headers: {
          Authorization: "Bearer " + token + "invalid",
          PsuedoToken: "error",
        },
      },
      null
    );

    expect(response.statusCode).toBe(403);
  });

  test("Handler - 200 GET request", async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      httpMethod: "GET",
      queryStringParameters: {
        getJob: "true"
      },
    };

    const result = await exportGET.handler(event, null)
    console.log('with params', result)

    expect(result).toEqual(
      expect.objectContaining({
        body: '{"status":"Job in progress","jobObj":{"progressDescription":"Initializing job.",'+
          '"progressPercentage":0,"progressState":"initializing","lastSuccessfulJob":{}}}',
        statusCode: 200,
      })
    );
  });
});
