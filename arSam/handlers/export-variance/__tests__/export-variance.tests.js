const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { PARKSLIST, SUBAREAS, VARIANCE_JOBSLIST, VARIANCE_MOCKJOB } = require("../../../__tests__/mock_data.json");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall } = require('@aws-sdk/util-dynamodb');
const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");

async function setupDb(TABLE_NAME) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  for (const park of PARKSLIST) {
    let params = {
        TableName: TABLE_NAME,
        Item: marshall(park),
      }
    dynamoClient.send(new PutItemCommand(params));
  }

  for (const subarea of SUBAREAS) {
    params = {
        TableName: TABLE_NAME,
        Item: marshall(subarea),
      }
    dynamoClient.send(new PutItemCommand(params));
  }

  for (const job of VARIANCE_JOBSLIST) {
    params = {
        TableName: TABLE_NAME,
        Item: marshall(job),
      }
    dynamoClient.send(new PutItemCommand(params));
  }
}

describe("Export Variance Report", () => {
  const OLD_ENV = process.env;
  let hash
  let TABLE_NAME
  let NAME_CACHE_TABLE_NAME
  let CONFIG_TABLE_NAME
  
  beforeEach(async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV }; // Make a copy of environment
    hash = getHashedText(expect.getState().currentTestName);
    process.env.TABLE_NAME = hash
    TABLE_NAME = process.env.TABLE_NAME;
    NAME_CACHE_TABLE_NAME = TABLE_NAME.concat("-nameCache");
    CONFIG_TABLE_NAME = TABLE_NAME.concat("-config");
    await createDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    await setupDb(TABLE_NAME);
  });

  afterEach(() => {
    deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
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
