const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const { REGION, ENDPOINT, TABLE_NAME } = require("./global/settings");
const { PARKSLIST, SUBAREAS, JOBSLIST, MOCKJOB } = require("./global/data.json");

const exportGET = require("../lambda/export/GET/index");
const exportFUNCTIONS = require("../lambda/export/functions");
const utils = require("../lambda/dynamoUtil");


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

  for (const job of JOBSLIST) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: job,
      })
      .promise();
  }
}

describe("Export Report", () => {
  beforeAll(async () => {
    return await setupDb();
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

  test("Handler - 200 GET, with no jobs", async () => {
    const dateField = "dateGenerated"
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
    let body;
    try {
      body = JSON.parse(result.body)
    } catch (e) {
      body = 'fail'
    }

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
      }),
    );
    expect(body.jobObj[dateField]).toMatch(JOBSLIST[0][dateField])
  })

  test("Handler - 200 GET, generate report", async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      httpMethod: "GET",
    };

    const result = await exportGET.handler(event, null)

    // Returns value below even with no job
    // Update when invokable can be called
    expect(result.body).toBe("{\"status\":\"Job is already running\"}")
  });

  test("Functions - updateJobEntry", async () => {
    const query = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND sk = :sk",
      ExpressionAttributeValues: {
        ":pk": { S: "job" },
        ":sk": {S: "MOCK_JOB_ID"}
      }
    };

    await exportFUNCTIONS.updateJobEntry(MOCKJOB, TABLE_NAME)
    const result = await utils.runQuery(query)

    expect(result).toMatchObject([MOCKJOB])
  })
});
