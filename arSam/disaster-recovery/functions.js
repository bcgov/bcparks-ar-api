const { exit } = require('process');
const { DateTime } = require('luxon');
const readline = require('readline');
const { spawn } = require('child_process');

const config = require('./config');
const { environment, timeout, vaultName, backupRole, inputType, dynamoInputType } = config;

let rlInterface;

/**
 * Creates a readline interface instance for handling command line input/output.
 *
 */
function activateReadline() {
  rlInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Clears the current input line and resets the prompt in the readline interface.
 *
 */
function clearInputAndResetPrompt() {
  if (rlInterface) {
    rlInterface.input.resume();
    rlInterface.clearLine(0);
    rlInterface.prompt();
  }
}

/**
 * Runs an AWS command from the user.
 *
 * @param   {Array} args - arguments for AWS command to execute
 *
 */
async function awsCommand(args) {
  const command = 'aws';

  return new Promise((resolve, reject) => {
    let stdoutData = '';
    let stderrData = '';

    const childProcess = spawn(command, args);

    childProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    childProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    childProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Child process exited with code ${code}`);
        console.error('stderr:', stderrData);
        reject(new Error(`AWS CLI command failed with exit code ${code}`));
      } else {
        try {
          const parsedOutput = JSON.parse(stdoutData);
          resolve(parsedOutput);
        } catch (error) {
          throw error;
        }
      }
    });
  });
}

/**
 * Sends the user back to the main menu (after a short delay).
 *
 */
async function backToMainMenu() {
  const { mainMenu } = require('./restore-dynamo');

  console.log(`\n🔙 Back to main menu...`);
  clearInputAndResetPrompt();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await mainMenu();
}

/**
 * Ask user if they would like to continue the script or exit.
 *
 */
async function backToMenuOrExit() {
  let confirmMainMenu = await getConsoleInput(
    `\n❔ Would you like to go back to the main menu? Otherwise the script will exit.`,
    ['y', 'n']
  );

  if (confirmMainMenu == 'y') {
    await backToMainMenu();
  } else {
    console.log(`\n👋 Exiting...`);
    exit();
  }
}

/**
 * Create a backup of a table in DynamoDB.
 *
 * @param   {String} sourceTable - the selected table to be back up
 * @param   {Object} backupName - name of the backup to be created
 * @returns {Object} AWS response with backup details
 *
 */
async function backupTableOnDemandDynamo(sourceTable, backupName) {
  try {
    let backedUpTable = await awsCommand([
      'dynamodb',
      'create-backup',
      '--table-name',
      sourceTable,
      '--backup-name',
      backupName
    ]);

    return backedUpTable.BackupDetails;
  } catch (error) {
    throw error;
  }
}

/**
 * Takes an operation type and uses its check function, args, and expectFromCheck to
 * update the console accordingly.
 *
 * @param   {Object} opsType - any operation type (eg. delete, restore, backup), which
 *                  contains the operation settings for that specified operation.
 * @returns {Object} returns the updated opsType object.
 *
 */
async function checkAndUpdate(opsType) {
  try {
    // Run the check function, which is something like checkTableExists(), etc.
    let check = await opsType.check(...opsType.args);

    if (check === opsType.expectFromCheck) {
      opsType.opStatus = 'success';
      updateConfirmMessage();
    } else {
      throw `Check function expected ${opsType.expectFromCheck} but returned ${check}. Were you expecting ${opsType.expectFromCheck}?`;
    }
  } catch (error) {
    throw error;
  }

  return opsType;
}

/**
 * Check if a backup exists in DynamoDB Backup.
 *
 * @param   {String}  sourceTable - the selected table to check
 * @param   {String}  backupName - name of backup to be created
 * @returns {Boolean} confirms the backup was created
 */
async function checkBackupExistsInDynamo(sourceTable, backupName) {
  let exists = false;
  let t = 0;
  const waitIndefinitely = timeout == -1;

  // Continue running until the backup exists
  // or timeout is reached (if set in config)
  while (!exists && (waitIndefinitely || t < timeout)) {
    outputTimeUpdate(t);

    // Check every 5 seconds if table has been restored
    if (t == 0 || t % 5 == 0) {
      try {
        backupsObj = await awsCommand(['dynamodb', 'list-backups', '--table-name', sourceTable]);

        exists = backupsObj.BackupSummaries.some(
          (summary) =>
            summary.TableName == sourceTable && summary.BackupName == backupName && summary.BackupStatus == 'AVAILABLE'
        );
      } catch (error) {
        throw error;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    t++;
  }

  // Only get here after timeout, offer user to keep waiting
  if (!exists) {
    let continueChecking = await getConsoleInput(`Timed out during checking if backup exists - continue waiting?`, [
      'y',
      'n'
    ]);

    if (continueChecking == 'y') {
      exists = await checkBackupExistsInDynamo(sourceTable, backupName);
    } else {
      console.log(`\nTry running again.`);
      console.log(`\nExiting...`);
      exit();
    }
  }

  return exists;
}

/**
 * Return true or false if there are any issues with the config.js file, as well
 * as any errors with the config.js
 *
 * @param   {Object} config - config items from config.js
 * @returns {Object} isValid boolean and an array of any errors
 *
 */
function checkConfig(config) {
  const errors = [];

  // Check environment exists and is valid
  if (!config.environment || typeof config.environment !== 'number') {
    errors.push('Environment must be a valid number');
  }

  // Validate timeout
  if (!Number.isInteger(config.timeout)) {
    errors.push('Timeout must be an integer');
  } else if (config.timeout !== -1 && config.timeout <= 0) {
    errors.push('Timeout must be -1 or a positive integer');
  }

  // Validate vaultName
  if (!config.vaultName || typeof config.vaultName !== 'string') {
    errors.push('Vault name must be a non-empty string');
  }

  // Validate backupRole
  if (!config.backupRole || typeof config.backupRole !== 'string') {
    errors.push('Backup role must be a non-empty string');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

/**
 * Gets all the AWS Backups for a table.
 *
 * @param   {String} chosenTable - the selected table to be backed up
 * @returns {Object} AWS response with backups details
 *
 */
async function getRecoveryPointsAWSBackupsByTable(chosenTable) {
  try {
    let backupsObj = await awsCommand([
      'backup',
      'list-recovery-points-by-backup-vault',
      '--backup-vault-name',
      `${vaultName}`,
      '--by-resource-type',
      'DynamoDB'
    ]);

    // Filter by recovery points where it matches the user's chosen table
    let backups = backupsObj.RecoveryPoints.filter((recoverPoints) => recoverPoints.ResourceName === chosenTable);

    return backups;
  } catch (error) {
    throw error;
  }
}

/**
 * Check if a table exists in AWS. This uses `aws describe-table` to see what the
 * current status of a table is and attempts to confirm/match the shouldExist param.
 *
 * @param   {String}  chosenTable - the selected table to check
 * @param   {Boolean} shouldExist - whether the table should or shouldn't exist
 * @returns {Boolean} confirmation that the table exists or doesn't exist
 *
 */
async function checkTableExists(chosenTable, shouldExist) {
  // conditional should be inverse of shouldExist
  let exists = !shouldExist;
  let tableListed = false;
  let t = 0;
  const waitIndefinitely = timeout == -1;

  // Continue running until conditional == shouldExist
  // or timeout is reached (if set in config)
  while (exists !== shouldExist && (waitIndefinitely || t < timeout)) {
    outputTimeUpdate(t);

    // Check every 5 seconds if table has been restored
    if (t == 0 || t % 5 == 0) {
      try {
        const tables = await listTables();

        // Check that the table exists. Table might show that it exists using list-tables
        // but it might still be loading.
        if (tables.length > 0) {
          tableListed = tables.some((table) => table == chosenTable);
        }

        // We flag if the table is missing and shouldExist is false because
        // this would mean it's deleted and we can send back the response now
        if (tableListed == false && shouldExist == false) {
          return false;
        }

        if (tableListed) {
          const tableDescription = await describeTable(chosenTable);

          const tableStatus = tableDescription.TableStatus;

          if (tableStatus == 'ACTIVE') {
            exists = true;
          }
        }
        outputTimeUpdate(t);
      } catch (error) {
        console.log('error', error);
        throw error;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    t++;
  }

  // Only get here after timeout, offer user to keep waiting
  if (exists != shouldExist) {
    let continueChecking = await getConsoleInput(`\n❔ Timed out during checking if table exists - continue waiting?`, [
      'y',
      'n'
    ]);

    if (continueChecking == 'y') {
      exists = await checkTableExists(chosenTable, shouldExist);
    } else {
      console.log(`\nTry running again.`);
      console.log(`\nExiting...`);
      exit();
    }
  }

  return exists;
}

/**
 * Checks if Deletion Protection is enabled for table.
 *
 * @param   {String}  chosenTable - the selected table to check
 * @returns {Boolean} confirms if Deletion Protection is enabled for a table
 *
 */
async function checkDeletionProtectionEnabled(chosenTable) {
  try {
    let checkDelPro = await awsCommand(['dynamodb', 'describe-table', '--table-name', chosenTable]);

    return checkDelPro.Table.DeletionProtectionEnabled;
  } catch (error) {
    throw error;
  }
}

/**
 * Checks that Point-in-Time Recovery is enabled for table
 *
 * @param   {String}  tableName - the selected table to check
 * @returns {Boolean} confirms if PITR is enabled for a table
 *
 */
async function checkPitrEnabled(tableName) {
  try {
    let checkPitr = await awsCommand(['dynamodb', 'describe-continuous-backups', '--table-name', tableName]);

    if (checkPitr.ContinuousBackupsDescription.ContinuousBackupsStatus == 'ENABLED') {
      return true;
    }

    return false;
  } catch (error) {
    throw error;
  }
}

/**
 * Clean up what's been created and lingering in AWS. The only table this deletes
 * is the duplicated table from PITR, otherwise it deletes any backups from the
 * other processes.
 *
 * Note: It will check if the original table exists in DynamoDB before it deletes
 * the backup, in case the original was deleted and then ran into an issue.
 *
 * @param   {Object} ops - all operation types (eg. delete, restore, backup) that
 *                   contain the operation parameters for their respective operations.
 *
 */
async function cleanAndExit(ops) {
  try {
    /*************************************************************
     * Cleaning up the duplicated table from PITR                *
     *************************************************************/
    if (ops.duplicate?.response && ops.duplicate?.response !== null) {
      process.stdout.write(`\n🪣  CLEANING the duplicate [${ops.duplicate.response.TableDescription.TableName}]...`);
      // Check the newly created duplicate exists still
      let duplicateExists = await checkTableExists(ops.duplicate.response.TableDescription.TableName, true);

      if (!duplicateExists) {
        console.log(
          `\n🗂️  Duplicate with name [${ops.duplicate.response.TableDescription.TableName}]. Has it already been deleted?`
        );
      } else {
        await deleteTable(ops.duplicate.response.TableDescription.TableName);
      }
      updateConfirmMessage();
    }

    /*************************************************************
     * Cleaning up any of the original table's DynamoDB Backups  *
     * but ONLY if the original table exists in DynamoDB         *                          *
     *************************************************************/
    const tables = await listTables();
    let tableListed = false;
    // Check that the table exists. Table might show that it exists using list-tables
    // but it might still be loading.
    if (tables.length > 0) {
      tableListed = tables.some((table) => table == ops.backupDynamoOG?.sourceTable);
    }

    if (tableListed && ops.backupDynamoOG?.response && ops.backupDynamoOG?.response !== null) {
      process.stdout.write(`\n🪣  CLEANING the original backup [${ops.backupDynamoOG.response.BackupName}]...`);
      // Check the newly created backup exists still
      let backupExistsOG = await checkBackupExistsInDynamo(
        ops.backupDynamoOG.sourceTable,
        ops.backupDynamoOG.response.BackupName
      );

      // If it doesn't exist, then it means it wasn't created for some reason.
      if (!backupExistsOG) {
        console.log(`\n💾 Backup with name [${ops.backupDynamoOG.backupName}] has already been deleted.`);
      } else {
        await deleteDynamoBackup(ops.backupDynamoOG.response.BackupArn);
      }
      updateConfirmMessage();
    } else if (ops.backupDynamoOG?.sourceTable) {
      process.stdout.write(`\n❗ Did not find original table [${ops.backupDynamoOG?.sourceTable}]`);
      process.stdout.write(`\n❗ SKIPPING DELETING the backup [${ops.backupDynamoOG?.response.BackupName}]...`);
    }

    /*************************************************************
     * Cleaning up any of the duplicate table's DynamoDB Backups *
     *************************************************************/
    if (ops.backupDynamoDupe?.response && ops.backupDynamoDupe?.response !== null) {
      process.stdout.write(`\n🪣  CLEANING the duplicate backup [${ops.backupDynamoDupe.response.BackupName}]...`);
      // Check the newly created backup exists still
      let backupExistsDupe = await checkBackupExistsInDynamo(
        ops.backupDynamoDupe.sourceTable,
        ops.backupDynamoDupe.backupName
      );

      // If it doesn't exist, then it means it wasn't created for some reason.
      if (!backupExistsDupe) {
        console.log(`\n💾 Backup with name [${ops.backupDynamoDupe.response.BackupName}] has already been deleted.`);
      } else {
        await deleteDynamoBackup(ops.backupDynamoDupe.response.BackupArn);
      }
      updateConfirmMessage();
    }

    console.log('\n✅ Finished cleaning.');
  } catch (error) {
    throw error;
  }

  console.log('\n✨ Reached the end of the process. ✨');
  await backToMenuOrExit();
}

/**
 * Let the user decide which backup they would like to restore from AWS Backups.
 *
 * @param   {String} chosenTable - the selected table used to look for backups
 * @param   {Array}  backups - the backups available from AWS Backups
 * @param   {String} manual - a flag to discern if this is a manual backup or part of
 *                   the AWS Backup Snapshot process. Only difference is console log at
 *                   the end of the function.
 * @returns {Object} the user-selected object from the backups array
 */
async function confirmAWSBackupChoice(chosenTable, backups, manual = true) {
  let currentTime = DateTime.now().toISO();
  console.log(`\n🔍 Looking at the AWS Backups for [${chosenTable}]...`);

  // Continue asking the user until they've decided on a backup choice.
  while (true) {
    try {
      console.log(`\n*-------------------------------*                                   `);
      console.log(`|  💾 CHOOSE A BACKUP 💾        |                                   `);
      console.log(`|------------------------------------------------------------------*`);
      console.log('|  Backup # |  Date         |  Name                     |  Storage |');
      console.log(`|------------------------------------------------------------------|`);

      for (let i = 0; i < backups.length; i++) {
        // Make sure the backups are completed and match table
        if (backups[i].Status === 'COMPLETED' && backups[i].ResourceName === chosenTable) {
          let dateTime = DateTime.fromISO(backups[i].CompletionDate).toFormat('LLL dd yyyy');
          let resource = backups[i].ResourceName;
          let resourceLength = resource.length;
          // Trim resource names that are too long
          resource = resourceLength >= 25 ? resource.slice(0, 21) + '...' : resource;

          // Share if it's cold or warm storage
          let storageType = '-';
          let coldStorageTime = backups[i].CalculatedLifecycle.MoveToColdStorageAt;
          if (coldStorageTime < currentTime) {
            storageType = 'Cold ⛄';
          } else {
            storageType = 'Warm 🔥';
          }

          console.log(
            `|     ${i + 1}     |  ${dateTime}  |  ${resource}${Array(
              25 - (resourceLength < 25 ? resourceLength : 24)
            ).join(' ')} |  ${storageType} |`
          );
        } else {
          console.log(`  No backups available for [${chosenTable}]!`);
          console.log(`|------------------------------------------------------------------|`);
          console.log('|  Try rerunning the script. 👋 Exiting...');
          console.log(`*------------------------------------------------------------------*`);
          exit();
        }
      }
      console.log(`|------------------------------------------------------------------|`);
      console.log(`| ⛄ Cold storage type takes -SIGNIFICANTLY- longer to restore ⛄  |`);
      console.log(`*------------------------------------------------------------------*`);

      // User selects the backup they want to provide for restore
      let chosenBackup = await getNumberInput(`\n💾 Which [${chosenTable}] backup would you like to restore from?`, [
        backups.length
      ]);

      // Warn users about cold storage restore times
      let coldStorageTime = backups[chosenBackup - 1].CalculatedLifecycle.MoveToColdStorageAt;
      if (coldStorageTime < currentTime) {
        confirmedColdStorage = await getConsoleInput(
          `\n⛄❗ Please note that restore from cold storage can take SEVERAL hours - continue?`,
          ['y', 'n']
        );

        // User changes their mind on which backup they want to use
        if (confirmedColdStorage == 'n') {
          console.log('Please select another backup.');
          continue;
        }
      }

      // Only show this message if it's the full AWS Snapshot restore.
      if (!manual) {
        console.log(`\n*-------------------------------*                                 `);
        console.log(`| ❗ READ BEFORE CONTINUING ❗  |                                   `);
        console.log(`|------------------------------------------------------------------*`);
        console.log(`|  In order to recreate a table from AWS Backup, this script will: |`);
        console.log(`|------------------------------------------------------------------|`);
        console.log(`|  1. BACKUP   the original to DynamoDB as a fallback.             |`);
        console.log(`|  1. DELETE   the original table                                  |`);
        console.log(`|              > CONFIRM: check if Deletion Protection is enabled. |`);
        console.log(`|              >CONFIRM: the table again before deletion.          |`);
        console.log(`|  2. RESTORE  the original from the backup                        |`);
        console.log(`*------------------------------------------------------------------*`);
      }

      // Confirm they want to continue with this restore choice
      let chosenBackupNumber = DateTime.fromISO(backups[chosenBackup - 1].CompletionDate).toFormat('LLL dd yyyy');
      let confirmBackup = await getConsoleInput(
        `\n⭐ Confirm you want to restore [${chosenTable}] from [${chosenBackupNumber}] and continue?`,
        ['y', 'n']
      );

      // User changes their mind on which backup they want to use
      if (confirmBackup == 'n') {
        console.log('Please select another backup.');
        continue;
      }

      return backups[chosenBackup - 1];
    } catch (error) {
      throw error;
    }
  }
}

/**
 * Let the user decide which backup they would like to restore from DynamoDB Backups.
 *
 * @param   {String} chosenTable - the selected table used to look for backups
 * @param   {Array}  backups - the backups available from DynamoDB Backups
 * @returns {Object} the user-selected object from the backups array
 */
async function confirmDynamoBackupChoice(chosenTable, backups) {
  console.log(`\n🔍 Looking at the Dynamo Backups for [${chosenTable}]...`);
  try {
    // If we have at least one backup, show the items
    if (backups.length > 0) {
      console.log(`\n*-------------------------------*                                   `);
      console.log(`|  💾 CHOOSE A BACKUP 💾        |                                   `);
      console.log(`|------------------------------------------------------------------*`);
      console.log('|  Backup #  |  Date                    |  Backup Name             |');
      console.log(`|------------------------------------------------------------------|`);
      for (let i = 0; i < backups.length; i++) {
        // Make sure the backups are completed and match table
        if (backups[i].BackupStatus === 'AVAILABLE' && backups[i].TableName === chosenTable) {
          let dateTime = DateTime.fromISO(backups[i].BackupCreationDateTime).toFormat('LLL dd yyyy - HH:mm:ss');
          let backupName = backups[i].BackupName;
          let backupNameLength = backups[i].BackupName.length;
          backupName = backupNameLength >= 24 ? backupName.slice(0, 21) + '...' : backupName;

          space = i < 9 ? '  ' : ' ';
          console.log(`|     ${i + 1}${space}    |  ${dateTime}  |  ${backupName}|`);
        }
      }
      console.log(`*------------------------------------------------------------------*`);
    }

    // User selects the backup they want to provide for restore
    let chosenBackup = await getNumberInput(`\n💾 Which [${chosenTable}] backup would you like to restore from?`, [
      backups.length
    ]);

    let chosenBackupNumber = DateTime.fromISO(backups[chosenBackup - 1].BackupCreationDateTime).toFormat(
      'LLL dd yyyy - HH:mm:ss'
    );
    let confirmBackup = await getConsoleInput(
      `\n⭐ Confirm you want to restore [${chosenTable}] from [${chosenBackupNumber}] and continue?`,
      ['y', 'n']
    );

    // User changes their mind on which backup they want to use
    if (confirmBackup == 'n') {
      chosenBackup = await confirmDynamoBackupChoice(chosenTable, backups);
    }

    return backups[chosenBackup - 1];
  } catch (error) {
    throw error;
  }
}

/**
 * Confirm with user if they'd like to initiate the the cleanup following PITR steps
 * or AWS Snapshot steps.
 *
 * @param   {Object} ops - all operation types (eg. delete, restore, backup) that
 *                   contain the operation parameters for their respective operations.
 *
 */
async function confirmInitiateCleanup(ops) {
  while (true) {
    let initiatedCleanup = await getConsoleInput(
      `\n🪣. Would you like to initiate the cleanup process? This will delete lingering resources created during the restore process. Although this will check (and double check again) and ensure tables are properly created/recreated, you may want to double check in AWS yourself before continuing, or skip this and delete manually in the AWS Console. Initiate cleanup here?`,
      ['y', 'n']
    );

    if (initiatedCleanup == 'y') {
      await cleanAndExit(ops);
      break;
    }
  }
}

/**
 * Lets the user see available restore times for a table's Point-in-Time recovery.
 * User is offered the earliest restorable time and latest restorable time and must
 * select a date/time between them using the acceptable DateTime format.
 *
 * @param   {Object} pitrBackups - object from AWS that contains information about
 *                                a table's PITR options
 * @returns {String} a DateTime item in the format of 'LLL dd yyyy - HH:mm:ss'
 *
 */
async function confirmPitrDateTime(chosenTable, pitrBackups) {
  let backups = pitrBackups.PointInTimeRecoveryDescription;

  // Convert backup times to a readable format, also the format expected to
  // be entered by user
  let earliestFormatted = DateTime.fromISO(backups.EarliestRestorableDateTime).toFormat(inputType);
  let latestRestore = backups.LatestRestorableDateTime;
  let latestFormatted = DateTime.fromISO(backups.LatestRestorableDateTime).toFormat(inputType);

  console.log(`\n*-------------------------------*                                   `);
  console.log(`|  🕑 CHOOSE A RESTORE TIME 🕑  |                                   `);
  console.log(`|------------------------------------------------------------------*`);
  console.log('|  Restorable Time              |  Date and Time                   |');
  console.log(`|------------------------------------------------------------------|`);
  console.log(`|  Earliest restorable time     |  ${earliestFormatted}          |`);
  console.log(`|  Latest restorable time       |  ${latestFormatted}          |`);
  console.log(`*------------------------------------------------------------------*`);

  // Confirm the date/time from the user
  let dateTimeInput = await getDateTimeInput(
    `\n🕑 How early would you like to restore?`,
    [inputType],
    earliestFormatted,
    latestFormatted
  );

  console.log(`\n*-------------------------------*                                   `);
  console.log(`| ❗ READ BEFORE CONTINUING ❗  |                                   `);
  console.log(`|------------------------------------------------------------------*`);
  console.log(`|  In order to recreate a table from PITR, this script will:       |`);
  console.log(`|------------------------------------------------------------------|`);
  console.log(`|  1. DUPLICATE the original table from the desired PITR date/time.|`);
  console.log(`|  2. BACKUP    the original to DynamoDB as a fallback.            |`);
  console.log(`|  3. BACKUP    the duplicate table after it's created in Step 1.  |`);
  console.log(`|  4. DELETE    the original table after it's backed up in Step 2. |`);
  console.log(`|               > CONFIRM: check if Deletion Protection is enabled.|`);
  console.log(`|               > CONFIRM: check again before deletion.            |`);
  console.log(`|  5. RESTORE   the original table from the duplicate backup.      |`);
  console.log(`|------------------------------------------------------------------|`);
  console.log(`|  🕑 PITR and Deletion Protection will then be activated again 🔒 |`);
  console.log(`*------------------------------------------------------------------*`);

  confirmRestoreTime = await getConsoleInput(
    `\n⭐ Confirm you want to restore [${chosenTable}] to [${dateTimeInput}] and continue?`,
    ['y', 'n']
  );

  // Rerun if user changes mind about time
  if (confirmRestoreTime == 'n') {
    dateTimeInput = await confirmPitrDateTime(chosenTable, pitrBackups);
  }
  return dateTimeInput;
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
  let confirmConfig = checkConfig(config);

  // Exit if there is an issue with the config
  if (!confirmConfig.isValid) {
    console.error('\n❗ Errors with config.js:');
    for (let error of confirmConfig.errors) {
      console.error('\n❗', error);
    }
    console.error(`\n👋 Exiting...`);
    exit();
  }

  let restoreOption;
  while (true) {
    try {
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
      console.log(`|         | est. time cold: ~2h  |                                 |`);
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
    } catch (error) {
      throw error;
    }
  }

  return restoreOption;
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
    try {
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
      chosenTable = await getNumberInput(`\n🗂️_ Please choose a table # to continue`, tables.length);

      let confirmTable = await getConsoleInput(
        `\n⭐ Confirm we are continuing with the [${tables[chosenTable - 1]}] table?`,
        ['y', 'n']
      );

      if (confirmTable == 'y' || confirmTable == 'Y') {
        decided = true;
      }
    } catch (error) {
      throw error;
    }
  }

  return tables[chosenTable - 1];
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
      `\n🖊  Enter the name of the table you'd like to restore. Only tables with matching backup names will be available for selection.`
    );

    confirmedName = await confirmToContinueYesNo(`\n⭐ Confirm the table name is [${chosenTable}]?`, ['y', 'n']);

    // Check that the table doesn't already exist
    if (confirmedName) {
      process.stdout.write(`\n⏳ Checking if table name already exists...`);
      tables = await listTables();
      tableAlreadyExists = tables.some((table) => table == chosenTable);

      // If table already exists, offer to send the user back to the menu
      if (tableAlreadyExists) {
        console.log(
          '\n\n❗ Table already exists, please delete the table first or provide a different table name for restore.'
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
 * Ask the user if they would like to complete an action (e.g. remove deletion
 * protection or confirm delete table); if yes, complete action; if no, exit.
 * This is an easier way to preserve history in ops and exit gracefully.
 *
 * @param   {Array}    query - question for user to consider in console.
 * @param   {Array}    yesOrNo - yes or no, expected by getConsoleInput.
 * @param   {Function} action - optional action to be completed if a user continues.
 * @param   {Array}    args - the params for the action function
 * @returns {Boolean}  returns if action was completed or if user wishes to exit
 *
 */
async function confirmToContinueYesNo(query, yesOrNo, action = null, args = []) {
  let response = await getConsoleInput(query, yesOrNo);

  if (response == 'y') {
    if (action) {
      try {
        process.stdout.write(`\n⏳ Working on it...`);
        let actionCompleted = await action(...args);

        // Check that action completed and returned a value
        if (actionCompleted) {
          updateConfirmMessage();
          return true;
        }
      } catch (error) {
        throw error;
      }
    } else {
      return true;
    }
  }
}

/**
 * Delete a backup from DynamoDB Backups.
 *
 * @param   {String}  backupArn - the ARN for the backup to be deleted
 * @returns {Boolean} confirms the table is deleted
 *
 */
async function deleteDynamoBackup(backupArn) {
  try {
    return await awsCommand(['dynamodb', 'delete-backup', '--backup-arn', backupArn]);
  } catch (error) {
    throw error;
  }
}

/**
 * Delete a table in AWS.
 *
 * @param   {String} tableName - the selected table
 * @returns {Object} AWS object with table deletion details
 *
 */
async function deleteTable(tableName) {
  try {
    return await awsCommand(['dynamodb', 'delete-table', '--table-name', tableName]);
  } catch (error) {
    throw error;
  }
}

/**
 * Get the description of a table in DynamoDB.
 *
 * @param   {String} tableName - the selected table to describe
 * @returns {Object} AWS object with a table's configuration settings
 *
 */
async function describeTable(tableName) {
  try {
    let tableConfig = await awsCommand(['dynamodb', 'describe-table', '--table-name', tableName]);
    return tableConfig.Table;
  } catch (error) {
    throw error;
  }
}

/**
 * Function to initiate creating the duplicate table from Point-in-Time.
 *
 * @param   {String} sourceTable - source table name
 * @param   {String} targetTable - name of the table being created as duplicate
 * @param   {String} dateTimeInputISO - DateTime in ISO format
 * @returns {Object} AWS response after creation
 *
 */
async function duplicateTablePitr(sourceTable, targetTable, dateTimeInputISO) {
  return await awsCommand([
    'dynamodb',
    'restore-table-to-point-in-time',
    '--source-table-name',
    sourceTable,
    '--target-table-name',
    targetTable,
    '--restore-date-time',
    dateTimeInputISO
  ]);
}

/**
 * Enable Deletion Protection for a table
 *
 * @param   {String} targetTable - the selected table
 * @returns {Object} AWS response with the updated table information
 *
 */
async function enableDeletionProtection(targetTable) {
  try {
    return await awsCommand(['dynamodb', 'update-table', '--table-name', targetTable, '--deletion-protection-enabled']);
  } catch (error) {
    throw error;
  }
}

/**
 * Enable Point-in-Time Recovery for a table.
 *
 * @param   {String} targetTable - the selected table
 * @returns {Object} AWS response with ContinuousBackupsDescription
 *
 */
async function enablePointInTimeRecovery(targetTable) {
  try {
    return await awsCommand([
      'dynamodb',
      'update-continuous-backups',
      '--table-name',
      targetTable,
      '--point-in-time-recovery-specification',
      'PointInTimeRecoveryEnabled=true'
    ]);
  } catch (error) {
    throw error;
  }
}

/**
 * Find and return all available tables in DynamoDB.
 *
 * @returns {Array} an array of available tables in DyanmoDB
 *
 */
async function getAvailableTables() {
  const tables = await listTables();
  // Skip returning the BCGOV table
  return tables.filter((table) => table !== 'BCGOV_IAM_USER_TABLE');
}

/**
 * Presents a console-based multiple-choice question to the user and validates their input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String} query - the question for the user to answer
 * @param   {Array}  options - options that the user can select from
 * @returns {Promise} provides the user's input response
 *
 */
async function getConsoleInput(query, options) {
  let optionsPrint = options.join(',');

  if (options.length > 5) {
    optionsPrint = `1 to ${options.length}`;
  }

  return new Promise((resolve) => {
    async function askQuestion() {
      activateReadline();
      rlInterface.question(`${wrapQuery(query)} [${optionsPrint}]\n>> `, async (answer) => {
        if (options.includes(answer.toLowerCase())) {
          rlInterface.close();
          resolve(answer);
        } else if (answer == 'exit') {
          console.log(`\n👋 Exiting...`);
          exit();
        } else if (answer == 'menu' || answer == 'main menu') {
          rlInterface.close();
          await backToMainMenu();
        } else if (answer == 'help') {
          await showHelpOptions();
          rlInterface.close();
          askQuestion();
        } else {
          console.error(
            wrapQuery(
              `\nInvalid option - please enter [${optionsPrint}]. Alternatively, you can type 'help' to open a help menu, type 'menu' for the main menu, or type 'exit' to end process.`
            )
          );
          rlInterface.close();
          askQuestion();
        }
      });
    }

    rlInterface.close();
    askQuestion();
  });
}

/**
 * Presents a console-based question to the user and validates their typed input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String}  query - the question for the user to answer
 * @returns {Promise} resolves with user's input response
 *
 */
async function getDynamoNameInput(query) {
  // Checking for a name that meets the DynamoDB naming conventions
  let dynamoPattern = /^(?:[a-zA-Z0-9_.-]{3,255})+(?:\s|$)$/;

  return new Promise((resolve) => {
    async function askQuestion() {
      activateReadline();
      rlInterface.question(`${query}\n>> `, (answer) => {
        if (dynamoPattern.test(answer)) {
          resolve(answer);
        } else {
          console.error(`\n❗ Incompatible naming convention for a DynamoDB table.`);
          console.error(
            `\n🗂️  Table names must be between 3 and 255 characters and can only contain the following characters:`
          );
          console.error(`    -  a to z`);
          console.error(`    -  A to Z`);
          console.error(`    -  0 to 9`);
          console.error(`    -  "_" (underscore)`);
          console.error(`    -  "-" (hyphen)`);
          console.error(`    -  "." (period)`);
          rlInterface.close();
          askQuestion();
        }
      });
    }
    rlInterface.close();
    askQuestion();
  });
}

/**
 * Presents a console-based question to the user and validates their typed DateTime input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String} query - the question for the user to answer
 * @param   {String} dtOptions - the DateTime format the user can provide
 * @returns {Promise} resolves with the user's DateTime input
 *
 */
async function getDateTimeInput(query, dtOptions, earliestFormatted, latestFormatted) {
  return new Promise((resolve) => {
    async function askQuestion() {
      activateReadline();
      rlInterface.question(`${query} ${dtOptions}\n>> `, (answer) => {
        answer = answer.trim();

        // Check that the entered DateTime meets the LLL dd yyyy - HH:mm:ss format
        dateTimePattern = /^[a-zA-Z]{3}\s\d{2}\s\d{4}\s-\s\d{2}:\d{2}:\d{2}$/;

        // Check if date and time input is not within the constraints
        if (answer >= earliestFormatted && answer <= latestFormatted) {
          resolve(answer);
        } else if (answer == 'exit') {
          console.log(`\n👋 Exiting...`);
          exit();
        } else if (!dateTimePattern.test(answer)) {
          console.error(`\nInvalid time format, must be format:  LLL dd yyyy - HH:mm:ss`);
          console.error(`Please try again or type 'exit' to end process.\n`);
          rlInterface.close();
          askQuestion();
        } else {
          console.error(`\nInvalid time, must be between [${earliestFormatted}] and [${latestFormatted}]`);
          console.error(`Please try again or type 'exit' to end process.\n`);
          rlInterface.close();
          askQuestion();
        }
      });
    }

    rlInterface.close();
    askQuestion();
  });
}

/**
 * Presents a console-based, multiple-choice question to the user and validates their input.
 * Continues prompting until valid input is received or navigation commands are used.
 *
 * @param   {String} query - the question for the user to answer
 * @returns {Number} resolves with the user's number input
 *
 */
async function getNumberInput(query, numberOptions) {
  let numberArray = [];
  for (let i = 1; i <= numberOptions; i++) {
    numberArray.push(i.toString());
  }

  while (true) {
    let choice = await getConsoleInput(query, numberArray);

    // Allow user to exit gracefully
    if (choice == 'n' || choice == 'N') {
      console.log('\nChose to exit.');
      exit();
    }

    // Not a number
    if (!choice.trim()) {
      throw `Please enter a valid number.`;
      continue;
    }

    const num = Number(choice);

    if (isNaN(num) || !isFinite(num)) {
      throw `That's not a valid number. Please try again.`;
      continue;
    }

    return num;
  }
}

/**
 * Fetches the available Point-in-Time Recovery options for a table
 *
 * @param   {String} tableName - the selected table
 * @returns {Object} AWS response with the PITR options for a table
 *
 */
async function getPitr(tableName) {
  console.log(`\n🔍 Looking at Point-in-Time Recovery for [${tableName}]...`);
  let backups;
  try {
    let checkTables = await awsCommand(['dynamodb', 'describe-continuous-backups', '--table-name', tableName]);
    backups = checkTables.ContinuousBackupsDescription;
  } catch (error) {
    throw error;
  }

  return backups;
}

/**
 * Fetches all the DynamoDB tables in the AWS environment
 * @returns {Array}  dynamo table names from the AWS environment
 *
 */
async function listTables() {
  try {
    let tablesObj = await awsCommand(['dynamodb', 'list-tables']);
    let tables = tablesObj.TableNames;

    return tables;
  } catch (error) {
    throw error;
  }
}

/**
 * Outputs the time remaining in minutes and seconds. Shows a fun clock emoji.
 *
 * @param   {Number} t - time, in seconds
 *
 */
function outputTimeUpdate(t) {
  let timePassing = [
    '🕐',
    '🕜',
    '🕑',
    '🕝',
    '🕒',
    '🕞',
    '🕓',
    '🕟',
    '🕔',
    '🕠',
    '🕕',
    '🕡',
    '🕖',
    '🕢',
    '🕗',
    '🕣',
    '🕘',
    '🕤',
    '🕙',
    '🕥',
    '🕚',
    '🕦',
    '🕛',
    '🕧'
  ];

  let clock;
  // 24 emojis to show, so we loop through the timePassing array
  if (t < 24) {
    clock = timePassing[t];
  } else {
    clock = timePassing[t % 24];
  }

  // Calculate the minute and seconds
  let m = Math.floor(t / 60);
  let s = t % ((m > 0 ? m : 1) * 60);

  // Only showing a single, 69-character line that's deleted and replaced each iteration
  let messageOutput = `  ${t >= 60 ? m + 'm' + ' ' + s : s}s ${clock}`;
  let messageLength = messageOutput.length;
  let cursorIndex = 69 - messageLength;

  process.stdout.cursorTo(cursorIndex);
  process.stdout.write(`${messageOutput}`);
}

/**
 * Remove Deletion Protection from a table.
 *
 * @param   {String} chosenTable - the selected table
 * @returns {Object} AWS response regarding the chosenTable table
 *
 */
async function removeDeletionProtection(chosenTable) {
  try {
    return await awsCommand([
      'dynamodb',
      'update-table',
      '--table-name',
      chosenTable,
      '--no-deletion-protection-enabled'
    ]);
  } catch (error) {
    throw error;
  }
}

/**
 * Restore a table from a backup in AWS Backup.
 *
 * @param   {String} targetTable - the selected table
 * @param   {Object} backupObj - an AWS backup object
 * @returns {Object} AWS response with details of the restored table
 */
async function restoreFromAWSBackup(targetTable, backupObj) {
  try {
    return await awsCommand([
      'backup',
      'start-restore-job',
      '--recovery-point-arn',
      backupObj.RecoveryPointArn,
      '--metadata',
      `TargetTableName=${targetTable}`,
      '--iam-role-arn',
      `arn:aws:iam::${environment}:role/${backupRole}`
    ]);
  } catch (error) {
    throw error;
  }
}

/**
 * Restore a table from a backup in DynamoBackup.
 *
 * @param   {String} targetTable - the selected table
 * @param   {String} backupName - the selected backup name
 *
 */
async function restoreFromDynamoBackup(targetTable, backupName) {
  let backups = await awsCommand(['dynamodb', 'list-backups']);

  // Find the backup
  let backup = backups.BackupSummaries.find((item) => item.BackupName == backupName);
  let backupArn = backup.BackupArn;

  try {
    return await awsCommand([
      'dynamodb',
      'restore-table-from-backup',
      '--target-table-name',
      targetTable,
      '--backup-arn',
      backupArn
    ]);
  } catch (error) {
    throw error;
  }
}

/**
 * Show help information regarding some of the options in the script.
 *
 * @param   {String} targetTable - the selected table
 * @param   {String} backupName - the selected backup name
 *
 */
async function showHelpOptions() {
  while (true) {
    console.warn(`\n*------------------------*                                        `);
    console.warn(`|  HELP OPTIONS           |                                         `);
    console.warn(`*------------------------------------------------------------------*`);
    console.warn(`|  Option    | Item                                                |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    1       |  AWS Backups                                        |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    2       |  AWS Snapshot Process                               |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    3       |  Cold Storage                                       |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    4       |  Deletion Protection                                |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    5       |  DynamoDB Backups                                   |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    6       |  Enabling Deletion Protection                       |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    7       |  Enabling PITR                                      |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    8       |  Point-in-Time (PITR)                               |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    9       |  Point-in-Time (PITR) Recovery Process              |`);
    console.warn(`|------------------------------------------------------------------|`);
    console.warn(`|    10      |  Warm Storage                                       |`);
    console.warn(`*------------------------------------------------------------------*`);

    let helpNeeded = await getNumberInput(`Which item do you require help with?`, 10);

    switch (helpNeeded) {
      case 1:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| AWS        | AWS Backup is a service used to centralize and help |`);
        console.warn(`| Backups    | automate data protection in AWS. AWS Backups can be |`);
        console.warn(`|            | scheduled to be created at just about any date,     |`);
        console.warn(`|            | time, and frequency. AWS Backup allows users to     |`);
        console.warn(`|            | back different types of services/resources and store|`);
        console.warn(`|            | them in a "vault".                                  |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Note: These backups are NOT deleted during these    |`);
        console.warn(`|            | processes.                                          |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 2:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| AWS        | AWS Snapshot is a process that restores a DynamoDB  |`);
        console.warn(`| Snapshot   | table from a backup in AWS Backups within the last  |`);
        console.warn(`| Process    | 1 to 12 months. The user is prompted to select an   |`);
        console.warn(`|            | existing table, and then select an available backup |`);
        console.warn(`|            | from AWS Backups. The process will warn the user if |`);
        console.warn(`|            | if the backup is warm or cold storage.              |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Cleanup can be initiated after the process finishes.|`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 3:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Cold       | Cold storage is a term AWS uses for a type of data  |`);
        console.warn(`| Storage    | storage. Cold storage is one of the lowest costs    |`);
        console.warn(`|            | for storing data in AWS, with the drawback that it  |`);
        console.warn(`|            | takes significantly longer to access it on demand.  |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 4:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Deletion   | Deletion Protection is a property that can be       |`);
        console.warn(`| Protection | enabled on a DynamoDB table to provide a safeguard  |`);
        console.warn(`|            | and avoid accidental table deletion.                |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 5:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| DynamoDB   | DynamoDB has its own backup storage where table     |`);
        console.warn(`| Backups    | data can be stored. This backup storage strategy    |`);
        console.warn(`|            | is used in these scripts to differentiate between   |`);
        console.warn(`|            | the backups made monthly in AWS Backups.            |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Note: These backups CAN be deleted after the        |`);
        console.warn(`|            | processes are complete.                             |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 6:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Enable     | This enables Deletion Protection for a table        |`);
        console.warn(`| Deletion   | immediately. A table with Deletion Protection       |`);
        console.warn(`| Protection | requires another step of confirmation before it can |`);
        console.warn(`|            | deleted by the user.                                |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 7:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Enable     | This enables PITR for a table immediately. PITR is  |`);
        console.warn(`| PITR       | set to be 35 days by default.                       |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 8:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| PITR       | Point-in-Time Recovery (PITR) is a feature in AWS   |`);
        console.warn(`|            | that provides automatic backups of a DynamoDB table |`);
        console.warn(`|            | data. When enabled, PITR snapshots a table every    |`);
        console.warn(`|            | second, up to a maximum of 35 days, so you can      |`);
        console.warn(`|            | restore a table from any point in time in those 35  |`);
        console.warn(`|            | days.                                               |`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 9:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| PITR       | Point-in-Time Recovery (PITR) allows you to restore |`);
        console.warn(`| Process    | a table at any point in time in the last 35 days.   |`);
        console.warn(`|            | The process asks you to confirm the table you want  |`);
        console.warn(`|            | to restore, and then confirm a DateTime input:      |`);
        console.warn(`|            | LLL dd yyyy - HH:mm:ss (eg. Jan 23 2025 - 12:30:00).|`);
        console.warn(`|            | The script will then proceed to run a series of     |`);
        console.warn(`|            | duplications and backups to restore the table to    |`);
        console.warn(`|            | that time.                                          |`);
        console.warn(`|            |                                                     |`);
        console.warn(`|            | Cleanup can be initiated after the process finishes.|`);
        console.warn(`*------------------------------------------------------------------*`);
        break;
      case 10:
        console.warn(`\n*------------------------------------------------------------------*`);
        console.warn(`| Warm       | Warm storage is a term AWS uses for a type of data  |`);
        console.warn(`| Storage    | storage. Warm storage is slightly costlier than cold|`);
        console.warn(`|            | storage in AWS, but takes a significantly shorter   |`);
        console.warn(`|            | time to access it on demand.                        |`);
        console.warn(`*------------------------------------------------------------------*`);
    }

    let needMoreHelp = await getConsoleInput(`Still need help?`, ['y', 'n']);

    if (needMoreHelp == 'n') {
      break;
    }
  }
}

/**
 * Outputs the confirmation message to the console
 *
 */
function updateConfirmMessage() {
  process.stdout.cursorTo(67);
  process.stdout.write(`✅          \n`);
}

/**
 * Helps wrap the query message to the console and maintain the max width
 * of 68 characters.
 *
 */

function wrapQuery(query, maxLength = 68) {
  const words = query.split(/\s+/);
  let result = [];
  let currentLine = '';
  let charCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordLength = word.length;

    if (charCount + wordLength > maxLength) {
      // If adding the word would exceed the limit, start a new line
      if (wordLength > maxLength) {
        // If the word itself is too long, split it across multiple lines
        while (wordLength > maxLength) {
          result.push(word.slice(0, maxLength));
          word = word.slice(maxLength);
          wordLength -= maxLength;
        }
        result.push(word);
      } else {
        // Add the current line to the result and reset it
        result.push(currentLine.trim());
        currentLine = word + ' ';
        charCount = wordLength + 1;
      }
    } else {
      // Add the word to the current line
      currentLine += word + ' ';
      charCount += wordLength + 1;
    }
  }

  if (currentLine.trim()) {
    result.push(currentLine.trim());
  }

  return '\n' + result.join('\n');
}

module.exports = {
  activateReadline,
  awsCommand,
  backToMainMenu,
  backToMenuOrExit,
  backupTableOnDemandDynamo,
  checkAndUpdate,
  checkBackupExistsInDynamo,
  checkDeletionProtectionEnabled,
  checkPitrEnabled,
  checkTableExists,
  cleanAndExit,
  confirmAWSBackupChoice,
  confirmDynamoBackupChoice,
  confirmInitiateCleanup,
  confirmPitrDateTime,
  confirmRestoreProcess,
  confirmTable,
  confirmTableName,
  confirmToContinueYesNo,
  DateTime,
  deleteTable,
  describeTable,
  duplicateTablePitr,
  enableDeletionProtection,
  enablePointInTimeRecovery,
  exit,
  getAvailableTables,
  getConsoleInput,
  getPitr,
  getRecoveryPointsAWSBackupsByTable,
  removeDeletionProtection,
  restoreFromAWSBackup,
  restoreFromDynamoBackup,
  wrapQuery
};
