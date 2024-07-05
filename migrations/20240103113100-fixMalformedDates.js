const AWS = require('aws-sdk');
const { dynamodb, TABLE_NAME, getOne } = require('../lambda/dynamoUtil');
const readXlsxFile = require('read-excel-file/node');

const file = '../migrations-data/20240103113100_data.xlsx';

/*
This migration is to fix a handful of activity records that have incorrectly formated dates (and therefore sks). When trying to find an exhaustive list of these records, I did a database scan for all items where:

  begins_with(pk: ':pk') AND begins_with(sk: 020)

Obviously this is a very expensive query so I only scanned instances where ':pk'=0,1. I got a total of 31 results. Every single result has a 'lastUpdated' param of approximately the same time which indicates the malformed dates are a result of a bad migration and not something that is inherently wrong with the lambda that creates the activity records.

It is difficult to tell exactly how the sk and date are mangled on these records. The dates all consist of 6 digits, where in other records, the first 4 digits are the year and the last two are the 2-digit month. I am going to assume that dates that begin with '0202' are for 2022 and dates that begin with '0203' are for 2023. This makes sense considering the last two digits of '0202' dates are 11 and 12, and the last two digits of '0203' dates is always 01, pertaining to the contiguous 3 month period between Nov 2022 and Jan 2023 before the 'lastUpdated' date of Feb 24 2023. 

This migration is idempotent.
*/

const schema = {
  'pk': {
    prop: 'pk',
    type: String
  },
  'sk': {
    prop: 'sk',
    type: String
  }
}

async function updateRecords() {
  const records = await readXlsxFile(file, { schema });
  let successes = 0;
  try {
    for (const record of records.rows) {
      let old = await getOne(record.pk, record.sk);
      if (Object.keys(old)?.length) {
        const oldDate = old.date;
        // fix old sk and date
        const month = old.date.slice(4, 6);
        let year = '';
        if (old.date.slice(0, 4) === '0202') {
          // its a 2022 record
          year = '2022'
        } else if (old.date.slice(0, 4) === '0203') {
          // its a 2023 record
          year = '2023';
        } else {
          throw 'Year is neither 0202 (2022) nor 0203 (2023)';
        }
        const newDate = `${year}${month}`;
        old.sk = newDate;
        old.date = newDate;
        // create new record
        const newItem = {
          TableName: TABLE_NAME,
          Item: AWS.DynamoDB.Converter.marshall(old)
        }
        await dynamodb.putItem(newItem).promise();
        // delete old record
        const deleteItem = {
          TableName: TABLE_NAME,
          Key: {
            pk: { S: old.pk },
            sk: { S: oldDate }
          }
        }
        await dynamodb.deleteItem(deleteItem).promise();
      }
      successes++;
    }
    console.log('Successes:', successes);
  } catch (err) {
    console.log('Error:', err);
  }
}

updateRecords();