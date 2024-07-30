const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { PARKSLIST, SUBAREAS, JOBSLIST, MOCKJOB } = require("../../../__tests__/mock_data.json");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall } = require('@aws-sdk/util-dynamodb');

const jwt = require("jsonwebtoken");
const tokenContent = {
  resource_access: { "attendance-and-revenue": { roles: ["sysadmin"] } },
};
const token = jwt.sign(tokenContent, "defaultSecret");

async function setupDb(tableName) {
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });

  for (const park of PARKSLIST) {
    let params = {
        TableName: tableName,
        Item: marshall(park),
      }
    await dynamoClient.send(new PutItemCommand(params))
  }

  for (const subarea of SUBAREAS) {
    let params = {
        TableName: tableName,
        Item: marshall(subarea),
      }  
    await dynamoClient.send(new PutItemCommand(params))
    }

  for (const job of JOBSLIST) {
    let params = {
        TableName: tableName,
        Item: marshall(job),
    }
    await dynamoClient.send(new PutItemCommand(params))
  }
}

describe("Export Report", () => {
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
    const result = await exportGET.handler(event, null);
    let body;
    try {
      body = JSON.parse(result.body)
    } catch (e) {
      console.log("In this dumb catch")
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
