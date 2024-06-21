const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const { REGION, ENDPOINT, TABLE_NAME } = require("../../../__tests__/settings");
const { PARKSLIST, SUBAREAS, JOBSLIST, MOCKJOB } = require("../../../__tests__/mock_data.json");

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
  const OLD_ENV = process.env;
  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
  });

  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  beforeAll(async () => {
    return await setupDb();
  });

  test("Handler - 403 GET Invalid Auth", async () => {
    const event = {
        headers: {
          Authorization: "Bearer " + token,
        },
        requestContext: {
          authorizer: {
              roles: "[\"public\"]",
              isAdmin: false,
              isAuthenticated: false,
          }
        },
        httpMethod: "GET",
        queryStringParameters: {
          getJob: "true"
        },
    };
      
    const exportGET = require("../GET/index");
    const response = await exportGET.handler(event, null);

    expect(response.statusCode).toBe(403);
  });

  test("Handler - 200 GET, with no jobs", async () => {
    process.env.IS_OFFLINE = 'true'
    const dateField = "dateGenerated"
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      requestContext: {
        authorizer: {
            roles: "[\"sysadmin\"]",
            isAdmin: true,
            isAuthenticated: true,
        }
      },
      httpMethod: "GET",
      queryStringParameters: {
        getJob: "true"
      },
    };

    const exportGET = require("../GET/index");
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
          "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
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
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
      httpMethod: "GET",
    };
    const exportGET = require("../GET/index"); 
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

    const exportFUNCTIONS = require("/opt/functionsLayer");
    await exportFUNCTIONS.updateJobEntry(MOCKJOB, TABLE_NAME)
    const utils = require("/opt/baseLayer");
    const result = await utils.runQuery(query)

    expect(result).toMatchObject([MOCKJOB])
  })
});
