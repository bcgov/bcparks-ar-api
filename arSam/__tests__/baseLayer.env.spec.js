const ORIGINAL_ENV = process.env;

function loadBaseLayer(env = {}) {
  jest.resetModules();

  process.env = {
    ...ORIGINAL_ENV,
    AWS_REGION: 'ca-central-1',
    ...env
  };

  jest.doMock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation((options) => ({ options })),
    GetItemCommand: jest.fn(),
    QueryCommand: jest.fn(),
    PutItemCommand: jest.fn(),
    UpdateItemCommand: jest.fn(),
    BatchWriteItemCommand: jest.fn(),
    TransactWriteItemsCommand: jest.fn(),
    ScanCommand: jest.fn(),
    DeleteItemCommand: jest.fn()
  }));

  jest.doMock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation((options) => ({ options })),
    PutObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn()
  }));

  jest.doMock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: jest.fn()
  }));

  jest.doMock('@aws-sdk/client-lambda', () => ({
    Lambda: jest.fn().mockImplementation((options) => ({ options }))
  }));

  require('../layers/baseLayer/baseLayer');

  return require('@aws-sdk/client-dynamodb');
}

describe('baseLayer DynamoDB endpoint configuration', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('does not force localhost when DYNAMODB_ENDPOINT_URL is blank', () => {
    const dynamodb = loadBaseLayer({
      IS_OFFLINE: 'false',
      DYNAMODB_ENDPOINT_URL: ''
    });

    expect(dynamodb.DynamoDBClient).toHaveBeenCalledWith({
      region: 'ca-central-1'
    });
  });

  it('uses an explicit endpoint when one is provided', () => {
    const dynamodb = loadBaseLayer({
      IS_OFFLINE: 'true',
      DYNAMODB_ENDPOINT_URL: 'http://host.containers.internal:8000'
    });

    expect(dynamodb.DynamoDBClient).toHaveBeenCalledWith({
      region: 'ca-central-1',
      endpoint: 'http://host.containers.internal:8000'
    });
  });
});

