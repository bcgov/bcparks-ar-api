const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const { REGION, ENDPOINT, TABLE_NAME } = require("../../../__tests__/settings");
const { PARKSLIST, SUBAREAS, VARIANCE_JOBSLIST, VARIANCE_MOCKJOB } = require("../../../__tests__/mock_data.json");

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

  for (const job of VARIANCE_JOBSLIST) {
    await docClient
      .put({
        TableName: TABLE_NAME,
        Item: job,
      })
      .promise();
  }
}

describe("Export Variance Report", () => {
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
        httpMethod: "GET",
        requestContext: {
            authorizer: {
            roles: "[\"public\"]",
            isAdmin: false,
            isAuthenticated: false,
            },
        },
    };

    const varianceExportGET = require("../GET/index");
    const response = await varianceExportGET.handler(event, null);

    expect(response.statusCode).toBe(403);
  });

  test("Handler - 400 no fiscal year provided", async () => {
    const dateField = "dateGenerated"
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      httpMethod: "GET",
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
      queryStringParameters: {
        getJob: "true"
      },
    };

    const varianceExportGET = require("../GET/index");
    const result = await varianceExportGET.handler(event, null);
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
        statusCode: 400,
      }),
    );
  })

  test("Handler - 200 GET, with no jobs", async () => {
    process.env.IS_OFFLINE = 'true'
    const dateField = "dateGenerated"
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      httpMethod: "GET",
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
      queryStringParameters: {
        getJob: "true",
        fiscalYearEnd: 2023
      },
    };

    const varianceExportGET = require("../GET/index");
    const result = await varianceExportGET.handler(event, null);
    let body;
    try {
      body = JSON.parse(result.body)
      console.log('body:', body);
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
    expect(body.jobObj[dateField]).toMatch(VARIANCE_JOBSLIST[0][dateField])
  })

  test("Handler - 200 GET, generate report", async () => {
    const event = {
      headers: {
        Authorization: "Bearer " + token,
      },
      httpMethod: "GET",
      requestContext: {
        authorizer: {
          roles: "[\"sysadmin\"]",
          isAdmin: true,
          isAuthenticated: true,
        },
      },
      queryStringParameters: {
        fiscalYearEnd: 2023
      },
    };
    const varianceExportGET = require("../GET/index"); 
    const result = await varianceExportGET.handler(event, null)

    // Returns value below even with no job
    // Update when invokable can be called
    expect(result.body).toBe("{\"msg\":\"Variance report export job already running\"}")
  });
});
