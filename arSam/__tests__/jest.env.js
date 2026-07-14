process.env.AWS_REGION = process.env.AWS_REGION || process.env.REGION || 'local-env';
process.env.DYNAMODB_ENDPOINT_URL =
  process.env.DYNAMODB_ENDPOINT_URL || process.env.ENDPOINT || 'http://localhost:8000';
process.env.IS_OFFLINE = process.env.IS_OFFLINE || 'true';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'dummy';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'dummy';
process.env.AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || 'dummy';

