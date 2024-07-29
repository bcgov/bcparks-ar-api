const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { REGION, ENDPOINT } = require("../../../__tests__/settings");
const { getHashedText, deleteDB, createDB } = require("../../../__tests__/setup");
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');


async function setupDb(TABLE_NAME) {
  // Insert a document for the handler to now find and update.
  const dynamoClient = new DynamoDBClient({
    region: REGION,
    endpoint: ENDPOINT
  });
  const params = {
      TableName: TABLE_NAME,
      Item: marshall({
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
      })
    }
    await dynamoClient.send(new PutItemCommand(params));
}

describe("Name Update Tests", () => {
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
    process.env.NAME_CACHE_TABLE_NAME = NAME_CACHE_TABLE_NAME;
    process.env.TABLE_NAME = TABLE_NAME;
    process.env.CONFIG_TABLE_NAME = CONFIG_TABLE_NAME;
    await createDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    await setupDb(TABLE_NAME);
  });

  afterEach(() => {
    deleteDB(TABLE_NAME, NAME_CACHE_TABLE_NAME, CONFIG_TABLE_NAME);
    process.env = OLD_ENV; // Restore old environment
  });

  test("updateLocalCache", async () => {
    const axios = require('axios');
    jest.mock("axios");
    
    const dynamoClient = new DynamoDBClient({
      region: REGION,
      endpoint: ENDPOINT
    });

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
      Key: marshall({
        pk: "1",
      }),
    };

    // AR document key
    const AR_DOCUMENT_KEY = marshall({
      pk: "0673::Backcountry Cabins",
      sk: "201702"
    });

    // Ensure this doesn't exist yet.
    const notFoundDoc = await dynamoClient.send(new GetItemCommand(CACHED_DOCUMENT));
        const responseItem = notFoundDoc.Item;
    expect(responseItem).toBeUndefined();

    // Call the handler, it will have cache-miss
    await nameUpdateHandler.handler({}, null);

    // Expect the cache to be updated.
    const docRes = await dynamoClient.send(new GetItemCommand(CACHED_DOCUMENT));
    const doc = unmarshall(docRes.Item);
    expect(doc.pk).toBe("1");

    // Change the last cached item to be different in order to trigger a displayName
    // change on the handler.
    const params = {
      TableName: NAME_CACHE_TABLE_NAME,
      Key: marshall({ pk: '1' }),
      UpdateExpression: 'set displayName =:displayName',
      ExpressionAttributeValues: marshall({
        ':displayName': 'some other park name'
      })
    };

    await dynamoClient.send(new UpdateItemCommand(params));
    const cachedDocumentSetRes = await dynamoClient.send(new GetItemCommand(CACHED_DOCUMENT));
    const cachedDocumentSet = unmarshall(cachedDocumentSetRes.Item);
    expect(cachedDocumentSet.displayName).toBe('some other park name');

    // Also update the backcountry cabin record in the main table
    const params2 = {
      TableName: TABLE_NAME,
      Key: AR_DOCUMENT_KEY,
      UpdateExpression: 'set parkName =:parkName',
      ExpressionAttributeValues: marshall({
        ':parkName': 'some other park name'
      })
    };
    await dynamoClient.send(new UpdateItemCommand(params2));

    const params3 = {
      TableName: TABLE_NAME,
      Key: AR_DOCUMENT_KEY,
    }
    const arDocumentSetParkNameRes = await dynamoClient.send(new GetItemCommand(params3));
    const arDocumentSetParkName = unmarshall(arDocumentSetParkNameRes.Item);
    expect(arDocumentSetParkName.parkName).toBe('some other park name');

    // Run the update
    await nameUpdateHandler.handler({}, null);

    // Fetch the updated cache and check that it has been updated
    const cachedDocumentRes = await dynamoClient.send(new GetItemCommand(CACHED_DOCUMENT));
    const cachedDocument = unmarshall(cachedDocumentRes.Item);
    expect(cachedDocument.displayName).toBe('Strathcona Park');

    // Fetch the updated AR document and check that it has been udpated

    const fetchParams = {
      TableName: TABLE_NAME,
      Key: AR_DOCUMENT_KEY,
    }

    const arDocumentRes = await dynamoClient.send(new GetItemCommand(fetchParams));
    const arDocument = unmarshall(arDocumentRes.Item);
    expect(arDocument.parkName).toBe('Strathcona Park');
  });
});
