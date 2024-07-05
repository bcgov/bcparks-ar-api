const AWS = require("aws-sdk");
const { DocumentClient } = require("aws-sdk/clients/dynamodb");
const { REGION, ENDPOINT, TABLE_NAME, NAME_CACHE_TABLE_NAME } = require("../../../__tests__/settings");
const docClient = new DocumentClient({
  region: REGION,
  endpoint: ENDPOINT,
  convertEmptyValues: true,
});
async function setupDb() {
  // Insert a document for the handler to now find and update.
  await docClient
    .put({
      TableName: TABLE_NAME,
      Item: {
        "pk": "0673::Backcountry Cabins",
        "sk": "201702",
        "activity": "Backcountry Cabins",
        "date": "201702",
        "isLegacy": true,
        "isLocked": true,
        "lastUpdated": "2023-04-04T21:32:34.317Z",
        "legacyData": {
          "legacy_backcountryCabinsNetRevenue": 0,
          "legacy_backcountryCabinsTotalAttendancePeople": 0
        },
        "orcs": "0001",
        "parkName": "Strathcona Park",
        "subAreaId": "0673"
      }
    })
    .promise();
}

describe("Name Update Tests", () => {
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

  test("updateLocalCache", async () => {
    const axios = require('axios');
    jest.mock("axios");
    axios.get.mockImplementation(
      () => Promise.resolve({
        statusCode: 200,
        data: {
          data: {
            items: [
              {
                updateDate: '2023-09-18T16:54:12.574Z',
                displayName: 'Strathcona Park',
                createDate: '2023-09-15T17:13:14.633Z',
                status: 'current',
                sk: 'Details',
                pk: '1',
                effectiveDate: '1911-03-01',
                legalName: 'Strathcona Park',
                phoneticName: ''
              }
            ]
          }
        }
      })
    );

    const nameUpdateHandler = require("../index");

    // Cached document keys
    const CACHED_DOCUMENT = {
      TableName: NAME_CACHE_TABLE_NAME,
      Key: {
        pk: "1",
      },
    };

    // AR document key
    const AR_DOCUMENT_KEY = {
      pk: "0673::Backcountry Cabins",
      sk: "201702"
    };

    // Ensure this doesn't exist yet.
    const notFoundDoc = await docClient.get(CACHED_DOCUMENT).promise();
    expect(notFoundDoc).toStrictEqual({});

    // Call the handler, it will have cache-miss
    await nameUpdateHandler.handler({}, null);

    // Expect the cache to be updated.
    const doc = await docClient.get(CACHED_DOCUMENT).promise();
    expect(doc.Item.pk).toBe("1");

    // Change the last cached item to be different in order to trigger a displayName
    // change on the handler.
    const params = {
      TableName: NAME_CACHE_TABLE_NAME,
      Key: { pk: '1' },
      UpdateExpression: 'set displayName =:displayName',
      ExpressionAttributeValues: {
        ':displayName': 'some other park name'
      }
    };
    await docClient.update(params).promise();
    const cachedDocumentSet = await docClient.get(CACHED_DOCUMENT).promise();
    expect(cachedDocumentSet.Item.displayName).toBe('some other park name');

    // Also update the backcountry cabin record in the main table
    const params2 = {
      TableName: TABLE_NAME,
      Key: AR_DOCUMENT_KEY,
      UpdateExpression: 'set parkName =:parkName',
      ExpressionAttributeValues: {
        ':parkName': 'some other park name'
      }
    };
    await docClient.update(params2).promise();
    const arDocumentSetParkName = await docClient.get({
                                                   TableName: TABLE_NAME,
                                                   Key: AR_DOCUMENT_KEY,
                                                 }).promise();

    expect(arDocumentSetParkName.Item.parkName).toBe('some other park name');

    // Run the update
    await nameUpdateHandler.handler({}, null);

    // Fetch the updated cache and check that it has been udpated
    const cachedDocument = await docClient.get(CACHED_DOCUMENT).promise();

    // Ensure it was updated
    expect(cachedDocument.Item.displayName).toBe('Strathcona Park');

    // Fetch the updated AR document and check that it has been udpated
    const arDocument = await docClient.get({
                                                        TableName: TABLE_NAME,
                                                        Key: AR_DOCUMENT_KEY,
                                                      }).promise();

    expect(arDocument.Item.parkName).toBe('Strathcona Park');
  });
});
