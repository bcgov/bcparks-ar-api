const {
  awsCommand,
  activateReadline,
  backToMainMenu,
  backToMenuOrExit,
  checkConfig,
  cleanAndExit,
  confirmToContinueYesNo,
  exit,
  getConsoleInput,
  getDynamoNameInput,
  getNumberInput,
  updateConfirmMessage,
  lineWrap
} = require('./functions');

const config = require('./config.js');
const { environment, vaultName, backupRole } = config;

// Restore options functions
const { performAWSBackupSteps } = require('./restore-options/perform-aws-backup-steps.js');
const { performDeleteTable } = require('./restore-options/perform-delete-table.js');
const { performBackupOriginal } = require('./restore-options/perform-backup-dynamo-original.js');
const { performManualRestoreAWS } = require('./restore-options/perform-manual-restore-aws.js');
const { performManualRestoreDynamo } = require('./restore-options/perform-manual-restore-dynamo.js');
const { performPitrSteps } = require('./restore-options/perform-pitr-steps.js');
const { performTurnOnPitr } = require('./restore-options/perform-turn-on-pitr.js');
const { performTurnOnDeletionProtection } = require('./restore-options/perform-turn-on-deletion-protection.js');

// Restore processes
const restoreProcesses = {
  BACKUP: performAWSBackupSteps,
  DELETE_TABLE: performDeleteTable,
  MANUAL_BACKUP: performBackupOriginal,
  MANUAL_RESTORE_AWS: performManualRestoreAWS,
  MANUAL_RESTORE_DYNAMO: performManualRestoreDynamo,
  PITR: performPitrSteps,
  TURN_ON_DELETION_PROTECTION: performTurnOnDeletionProtection,
  TURN_ON_PITR: performTurnOnPitr
};

async function mainMenu() {
  let ops = {};
  const tablesObj = await awsCommand(['dynamodb', 'list-tables']);
  let tables = tablesObj.TableNames;
  // Skip returning the BCGOV table
  tables = tables.filter((table) => table !== 'BCGOV_IAM_USER_TABLE');

  try {
    let restoreProcess;
    while (!restoreProcess) {
      // Ask the user to select their restore process, should match restoreProcesses
      restoreProcess = await confirmRestoreProcess();

      // If there are no processes selected, back to main menu
      if (!Object.keys(restoreProcesses).includes(restoreProcess)) {
        console.log(`\n🔙 Back to main menu...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
        restoreProcess = null;
      }
    }

    // Choose table name.
    // If it's a manual restore, the user is asked to type the table
    let chosenTable;
    if (restoreProcess == 'MANUAL_RESTORE_DYNAMO' || restoreProcess == 'MANUAL_RESTORE_AWS') {
      chosenTable = await confirmTableName(tables);
    } else {
      chosenTable = await confirmTable(tables);
    }

    // Run the process
    ops = await restoreProcesses[restoreProcess](ops, chosenTable);
  } catch (error) {
    // Catch any errors with the processes and initiate cleanup if needed
    console.log('\n');
    console.log('\n❗ Issue while running processes. Checking for things to clean...');

    // Check operations for any failures and show it to the user
    let cleanUp = false;
    for (let op of Object.keys(ops)) {
      if (ops[op].opStatus == 'failed') {
        cleanUp = true;
        console.error('\nFailure during: ', ops[op].operationName);
        console.error('\nError:', ops[op].errorMessage);
      }
    }

    // Clean up any lingering items, e.g. unnecessary backups, tables, etc.
    if (cleanUp) {
      console.log('\n🪣  Cleaning up and exiting...');
      await cleanAndExit(ops);
    }

    // Otherwise there's nothing to clean
    console.log('\n✅ Nothing to clean.');

    // If there's nothing to clean, then there might be an error elsewhere
    // Allow the user to print the stacktrace if they want
    let printStackTrace = await getConsoleInput(`\n🖨 Print the stack trace anyway?`, ['y', 'n']);
    console.log('\n🖨 Stack Trace:\n');

    if (printStackTrace == 'y') {
      console.error(error);
    }
  }

  console.log('\n✨ Reached the end of the process. ✨');
  await backToMenuOrExit();
}

/**
 * Ask the user what type of recovery process they would like to initiate. This can be
 * PITR, AWS Snapshot, Create a Backup in DynamoDB Backups, Restore from DynamoDB Backups,
 * Restore from a backup in AWS Backups, Delete a Table in DynamoDB, Enable PITR or Enable
 * Deletion Protection
 *
 * @returns {String} user's selection
 *
 */
async function confirmRestoreProcess() {
  let restoreOption;
  while (true) {
    console.log(`\n*------------------------------------------------------------------*`);
    console.log(`|  Disaster Recovery Initiated.                                    |`);
    console.log(`|                                                                  |`);
    console.log(`|  Environment: [${environment}]${Array(50 - environment.toString().length).join(' ')}|`);
    console.log(`|  Vault Name:  [${vaultName}]${Array(50 - vaultName.length).join(' ')}|`);
    console.log(`|  Backup Role: [${backupRole}]${Array(50 - backupRole.length).join(' ')}|`);
    console.log(`|                                                                  |`);
    console.log(`|  Please select a restore option from below.                      |`);
    console.log(`*------------------------------------------------------------------*`);

    console.log(`\n*------------------------*                                           `);
    console.log(`|  AUTO RESTORE OPTIONS  |                                        `);
    console.log(`|------------------------------------------------------------------*`);
    console.log('|  Option |  Restore Type        |  Description                    |');
    console.log('|------------------------------------------------------------------|');
    console.log(`|    1    |     Point-in-Time    | Allows you to choose a date and |`);
    console.log(`|         |    Recovery (PITR)   | precise time (up to the second) |`);
    console.log(`|         |                      | to restore the table, from up   |`);
    console.log(`|         |   est. time: ~20m    | to 35 days ago.                 |`);
    console.log(`|------------------------------------------------------------------|`);
    console.log(`|    2    |      AWS Backup      | Allows you to restore a table   |`);
    console.log(`|         |       Snapshot       | from the last 12 months (this   |`);
    console.log(`|         |                      | is SIGNIFICANTLY faster if it's |`);
    console.log(`|         | est. time warm: ~20m | coming from warm storage).      |`);
    console.log(`|         | est. time cold: ~3h  |                                 |`);
    console.log(`*----------------------------------------------------------------- *`);
    console.log(`*------------------------*                                           `);
    console.log(`|  TABLE MANAGEMENT      |                                        `);
    console.log(`|------------------------------------------------------------------*`);
    console.log('|  Option |  Restore Type        |  Description                    |');
    console.log('|------------------------------------------------------------------|');
    console.log(`|    3    |  Create a Backup in  | Build a snapshot of a table and |`);
    console.log(`|         |   DynamoDB Backups   | store it in DynamoDB Backups.   |`);
    console.log('|------------------------------------------------------------------|');
    console.log(`|    4    |     Restore from     | Create a new table from a       |`);
    console.log(`|         |   DynamoDB Backups   | snapshot in DynamoDB Backups    |`);
    console.log('|------------------------------------------------------------------|');
    console.log(`|    5    |     Restore from     | Create a new table from a       |`);
    console.log(`|         |      AWS Backup      | snapshot in AWS Backups         |`);
    console.log('|------------------------------------------------------------------|');
    console.log(`|    6    |    Delete a Table    | Delete a table in DynamoDB.     |`);
    console.log(`|         |     in DynamoDB      | Check for Deletion Protection.  |`);
    console.log(`|------------------------------------------------------------------|`);
    console.log(`|    7    |   Enable Point-in-   | Enable Point-in-Time Recovery   |`);
    console.log(`|         | Time Recovery (PITR) | for a table.                    |`);
    console.log(`|------------------------------------------------------------------|`);
    console.log(`|    8    |   Enable Deletion    | Enable Deletion Protection for  |`);
    console.log(`|         |      Protection      | a table.                        |`);
    console.log(`*------------------------------------------------------------------*`);

    const restoreOptions = {
      1: {
        value: 'PITR',
        message: `
*------------------------------------------------------------------*
|  Initiating POINT-IN-TIME RECOVERY option...                     |
*------------------------------------------------------------------*`
      },
      2: {
        value: 'BACKUP',
        message: `
*------------------------------------------------------------------*
|  Initiating AWS BACKUP SNAPSHOT option...                        |
*------------------------------------------------------------------*`
      },
      3: {
        value: 'MANUAL_BACKUP',
        message: `
*------------------------------------------------------------------*
|  Initializing MANUAL BACKUP option...                            |
*------------------------------------------------------------------*`
      },
      4: {
        value: 'MANUAL_RESTORE_DYNAMO',
        message: `
*------------------------------------------------------------------*
|  Initializing RESTORE DYNAMODB BACKUPS option...                 |
*------------------------------------------------------------------*`
      },
      5: {
        value: 'MANUAL_RESTORE_AWS',
        message: `
*------------------------------------------------------------------*
|  Initializing RESTORE AWS BACKUP option...                       |
*------------------------------------------------------------------*`
      },
      6: {
        value: 'DELETE_TABLE',
        message: `
*------------------------------------------------------------------*
|  Initializing DELETE TABLE option...                             |
*------------------------------------------------------------------*`
      },
      7: {
        value: 'TURN_ON_PITR',
        message: `
*------------------------------------------------------------------*
|  Initializing Turning on PITR...                                 |
*------------------------------------------------------------------*`
      },
      8: {
        value: 'TURN_ON_DELETION_PROTECTION',
        message: `
*------------------------------------------------------------------*
|  Initializing Turning on DELETION PROTECTION...                  |
*------------------------------------------------------------------*`
      }
    };

    restoreOption = await getNumberInput(
      '\n❔ Which option would you like to use?',
      Object.keys(restoreOptions).length
    );

    // Print the restore option message and exit now that the user has
    // made their Option
    if (restoreOption in restoreOptions) {
      console.log(restoreOptions[restoreOption].message);
      restoreOption = restoreOptions[restoreOption].value;
      break;
    }
  }

  return restoreOption;
}

/**
 * Confirms the table name from user-typed input. The user can enter any name
 * as long as it's an acceptable DynamoDB naming convention as outlined in getDynamoNameInput.
 *
 * @param   {Array}  tables -  dynamo table names from the environment
 * @returns {String} the chosen table name for restoring
 *
 */
async function confirmTableName(tables) {
  let confirmedName;
  let chosenTable;
  // Confirm name, ensure table name doesn't already exist
  while (!confirmedName) {
    chosenTable = await getDynamoNameInput(
      lineWrap(
        `\n🖋️  Enter the name of the table you'd like to restore. Only tables with matching backup names will be available for selection.`
      )
    );

    confirmedName = await confirmToContinueYesNo(`\n⭐ Confirm the table name is [${chosenTable}]?`, ['y', 'n']);

    // Check that the table doesn't already exist
    if (confirmedName) {
      process.stdout.write(`\n⏳ Checking if table name already exists...`);
      let tablesObj = await awsCommand(['dynamodb', 'list-tables']);
      let tables = tablesObj.TableNames;
      tableAlreadyExists = tables.some((table) => table == chosenTable);

      // If table already exists, offer to send the user back to the menu
      if (tableAlreadyExists) {
        console.log('\n');
        console.log(
          lineWrap(
            '❗ Table already exists, please delete the table first or provide a different table name for restore.'
          )
        );
        return new Promise(async () => {
          await backToMainMenu();
        });
      } else {
        updateConfirmMessage();
      }
    }
  }

  return chosenTable;
}

/**
 * Confirms the table from available tables in DynamoDB.
 *
 * @param   {Array}  tables - available table names in DynamoDB from the
 *                   current environment
 * @returns {String} the chosen table name from the tables array
 *
 */
async function confirmTable(tables) {
  let decided = false;

  while (!decided) {
    console.log(`\n*-------------------------------*                                   `);
    console.log(`|  🗂️  CHOOSE A TABLE 🗂️          |                                 `);
    console.log(`|------------------------------------------------------------------*`);
    console.log('|  Table #   |  Table Name                                         |');
    console.log(`|------------------------------------------------------------------|`);

    for (let i = 0; i < tables.length; i++) {
      let tableLength = tables[i].length;
      let extraSpace = i >= 9 ? ' ' : '  ';
      console.log(
        `|    ${extraSpace + (i + 1)}     |  ${tables[i]}${Array(52 - (tableLength < 52 ? tableLength : 51)).join(
          ' '
        )}|`
      );
    }
    console.log(`*------------------------------------------------------------------*`);

    // Confirm the table the user wants to use
    chosenTable = await getNumberInput(`\n🗂️ Please choose a table # to continue`, tables.length);

    let confirmTable = await getConsoleInput(
      `\n⭐ Confirm we are continuing with the [${tables[chosenTable - 1]}] table?`,
      ['y', 'n']
    );

    if (confirmTable == 'y' || confirmTable == 'Y') {
      decided = true;
    }
  }

  return tables[chosenTable - 1];
}

async function run() {
  try {
    // Initial check of config
    let confirmConfig = await checkConfig(config);
    if (!confirmConfig.isValid) {
      console.error('\n❗ Errors with config.js:');
      for (let error of confirmConfig.errors) {
        console.error(lineWrap(`\n❗ ${error}`));
      }
      console.error(`\n👋 Exiting...`);
      exit();
    }

    process.stdout.cursorTo(0);
    process.stdout.write(`✅ No issues with the config. Continuing...\n`);

    activateReadline();
    await mainMenu();
  } catch (error) {
    console.log('\n❗', error, '\n');
    console.log(`\n👋 Exiting...`);
    exit();
  }
}

run();

module.exports = { mainMenu };
