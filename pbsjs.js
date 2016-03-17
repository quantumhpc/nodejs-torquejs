var cproc = require('child_process');
var spawn = cproc.spawnSync;
var fs = require("fs");

// Parse the command and return stdout of the process depending on the method
// TODO: treat errors
function spawnProcess(spawnCmd, spawnType, pbs_config){
    var spawnExec;
    switch (spawnType){
        case "shell":
            switch (pbs_config.method){
                case "ssh":
                    spawnExec = pbs_config.ssh_exec;
                    spawnCmd = [pbs_config.username + "@" + pbs_config.serverName,"-i",pbs_config.secretAccessKey].concat(spawnCmd.split(" "));
                    break;
                case "local":
                    spawnExec = pbs_config.local_shell;
                    spawnCmd = spawnCmd.split(" ");
                    break; 
            }
            break;
        //Copy send the 2 files in an array
        case "copy":
            // Special case if we can use a shared file system
            if (pbs_config.useSharedDir){
                spawnExec = pbs_config.local_copy;
            }else{
                switch (pbs_config.method){
                    // Build the scp command
                    case "ssh":
                        spawnExec = pbs_config.scp_exec;
                        spawnCmd = ["-i",pbs_config.secretAccessKey,spawnCmd[0],pbs_config.username + "@" + pbs_config.serverName+":"+spawnCmd[1]];
                        break;
                    case "local":
                        spawnExec = pbs_config.local_copy;
                        break; 
                }
            }
            break;
    }
    return spawn(spawnExec, spawnCmd, { encoding : 'utf8' });
}

function createUID()
{
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function createJobWorkDir(pbs_config){
    // Get configuration working directory
    var jobWorkingDir = pbs_config.working_dir;
    if (jobWorkingDir.slice(-1) != '/'){jobWorkingDir += '/'}
    
    // Generate a UID for the working dir
    jobWorkingDir += createUID() + "/";
    
    //Create workdir
    var mkdirOutput = spawnProcess("[ -d "+jobWorkingDir+" ] || mkdir "+jobWorkingDir,"shell",pbs_config);
    
    //TODO:handles error
    return jobWorkingDir;
}


//Takes an array to convert to JSON tree for queues and server properties
function jsonifyQmgr(output){
    var results=[];
    // JSON output will be indexed by queues and server
    results['queue']=[];
    results['queues']=[];
    results['server']={};
    //Loop on properties
    for (var i = 0; i < output.length; i++) {
        if (output[i].indexOf('=') !== -1){
            // Split key and value to 0 and 1
            var data = output[i].split('=');
            // Split at each space to create a node in JSON
            var keys = data[0].trim().split(' ');
            var value = data[1].trim();
            //TODO: do this more effentiely
            switch (keys[1].trim()){
                case 'server':
                    results['server'][keys[2].trim()] = value;
                    break;
                case 'queue':
                    // Order array under the queue name to easily store properties
                    results['queue'][keys[2].trim()] = results['queue'][keys[2].trim()] || {}; // initializes array if it is undefined
                    results['queue'][keys[2].trim()][keys[3].trim()] = value;
                    break;
            }
        }
    }
    // Loop on the sub-array 'queue' to reorganise it more JSON-like
    for (var x in results['queue']){
        // Add the name of the queue
        results['queue'][x]['name'] = x;
        results['queues'].push(results['queue'][x]);
    }
    // Clear the sub-array
    delete results['queue'];
    
    return results;
}

function jsonifyQnodes(output){
    var results={};
    // Store node name
    results["name"] = output[0];
    // Look for properties
    for (var i = 1; i < output.length; i++) {
        if (output[i].indexOf('=')!== -1){
           // Split key and value to 0 and 1
            var data = output[i].split('=');
            results[data.shift().trim()] = data.toString().trim();
                
        }
    }
    // Reorganise jobs into an array with jobId & jobProcs
    if (results['jobs']){
        var runningJobs = [];
        var jobData = results['jobs'].trim().split(/[,/]+/);
        // Parse jobs and forget trailing comma
        for (var j = 0; j < jobData.length-1; j+=2) {
            var newJob = {
                jobId       :   jobData[j+1],
                jobProcs    :   jobData[j],
            }
            runningJobs.push(newJob);
        }
        results['jobs'] = runningJobs;
    }
    // Reorganise status
    if (results['status']){
        var statusData = results['status'].trim().split(/[,]+/);
        for (var k = 0; k < statusData.length; k+=2) {
            // Skip jobs inside status for now : TODO: store those information
            if (statusData[k] == 'jobs'){
                while (statusData[k] != 'state'){
                    k++;
                }
            }
            results[statusData[k]] = statusData[k+1];
        }
        delete results['status'];
    }
    return results;
}

function jsonifyQstat(output){
    var results={};
    var status = {'Q' : 'Queued', 'R' : 'Running', 'C' : 'Completed', 'E' : 'Error'};
    results = {
        "jobId"     :   output[0],
        "name"      :   output[1],
        "user"      :   output[2],
        "time"      :   output[3],
        "status"    :   status[output[4]],
        "queue"     :   output[5],
    };
    return results;
}



// Generate the script to run the job and write it to the specified path
// Job Arguments taken in input : TO COMPLETE
// Return the full path of the SCRIPT
/* jobArgs = {
    shell           :   String      //  '/bin/bash'
    name            :   String      //  'XX'
    ressources      :   String      //  'nodes=X:ppn=X or select=X'
    walltime        :   String      //  'walltime=01:00:00'
    queue           :   String      //  'batch'
    exclusive       :   Boolean     //  '-n'
    mail            :   String      //  'myemail@mydomain.com'
    mailAbort       :   Boolean     //  '-m a'
    mailBegins      :   Boolean     //  '-m b'
    mailTerminates  :   Boolean     //  '-m e'
    commands        :   Array       //  'main commands to run'
    },
    localPath   :   'path/to/save/script'
    callback    :   callback(err,scriptFullPath)
}*/
// TODO: Consider piping the commands to qsub instead of writing script
function qscript_js(jobArgs, localPath, callback){
    // General PBS command inside script
    var PBScommand = "#PBS "
    var toWrite = "# Autogenerated script";
    
    // The name has to be bash compatible: TODO expand to throw other erros
    if (jobArgs.name.search(/[^a-zA-Z0-9]/g) !== -1){
        return callback(new Error('Name cannot contain special characters'))
    }

    var jobName = jobArgs.name;
    
    // Generate the script path
    if (localPath.slice(-1) != '/'){localPath += '/'}
    var scriptFullPath = localPath + jobName;
    
    // Job Shell
    toWrite += "\n" + PBScommand + "-S " + jobArgs.shell;
    
    // Job Name
    toWrite += "\n" + PBScommand + "-N " + jobName;
    
    // Ressources
    toWrite += "\n" + PBScommand + "-l " + jobArgs.ressources;
    
    // Walltime
    toWrite += "\n" + PBScommand + "-l " + jobArgs.walltime;
    
    // Queue
    toWrite += "\n" +  PBScommand + "-q " + jobArgs.queue;
    
    // Job exclusive
    if (jobArgs.exclusive){
        toWrite += "\n" + PBScommand + "-n";
    }
    
    // Send mail
    if (jobArgs.mail){
    
    toWrite += "\n" + PBScommand + "-M " + jobArgs.mail;
    
        // Test when to send a mail
        var mailArgs;
        if(jobArgs.mailAbort){mailArgs = '-m a';}
        if(jobArgs.mailBegins){     
          if (!mailArgs){mailArgs = '-m b'}else{mailArgs += 'b';}
        }
        if(jobArgs.mailTerminates){     
          if (!mailArgs){mailArgs = '-m e'}else{mailArgs += 'e';}
        }
        
        if (mailArgs){
            toWrite += "\n" + PBScommand + mailArgs;
        }
    }
    
    for (var i = 0; i < jobArgs.commands.length; i++){
        toWrite += "\n" + jobArgs.commands[i];
    }
    toWrite += "\n";
    // Write to script
    fs.writeFileSync(scriptFullPath,toWrite)
    
    return callback(null, {
        "message"   :   'Script for job ' + jobName + ' successfully created',
        "path"      :   scriptFullPath
        });
}

// Return the list of nodes
function qnodes_js(pbs_config, nodeName, callback){
    // JobId is optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    pbs_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd = pbs_config.binaries_dir + "qnodes";
    
    // Info on a specific node
    if (args.length == 1){
        nodeName = args.pop();
        remote_cmd += " " + nodeName;
    }
    
    var output = spawnProcess(remote_cmd,"shell",pbs_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr))
    }
    
    //Detect empty values
    output = output.stdout.replace(/=,/g,"=null,");
    //Separate each node
    output = output.split('\n\n');
    var nodes = [];
    //Loop on each node, the last one is blank due to \n\n
    for (var i = 0; i < output.length-1; i++) {
        //Split at lign breaks
        output[i]  = output[i].trim().split(/[\n;]+/);
        nodes.push(jsonifyQnodes(output[i]));
    }
    return callback(null, nodes);
}

// Return list of running jobs
// TODO: implement qstat -f
function qstat_js(pbs_config, jobId, callback){
    // JobId is optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    pbs_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd = pbs_config.binaries_dir + "qstat";
    
    // Info on a specific job
    if (args.length == 1){
        jobId = args.pop();
        remote_cmd += " -f " + jobId;
    }
    
    var output = spawnProcess(remote_cmd,"shell",pbs_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr))
    }
    
    output = output.stdout.split('\n');
    // First 2 lines are not relevant
    var jobs = [];
    for (var i = 2; i < output.length-1; i++) {
        output[i]  = output[i].trim().split(/[\s]+/);
        jobs.push(jsonifyQstat(output[i]));
    }
    return callback(null, jobs);
}

// Interface for qdel
// Delete the specified job Id and return the message and the status code
function qdel_js(pbs_config,jobId,callback){
    // JobId is optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    pbs_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd = pbs_config.binaries_dir + "qdel";
    if (args.length !== 1){
        // Return an error
        return callback(new Error('Please specify the jobId'))
    }else{
        jobId = args.pop();
        // Default print everything
        remote_cmd += " " + jobId;
    }
    var output = spawnProcess(remote_cmd,"shell",pbs_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr))
    }
    // Job deleted returns
    return callback(null, {"message" : 'Job ' + jobId + ' successfully deleted'});
}

// Interface for qmgr
// For now only display server info
function qmgr_js(pbs_config, qmgrCmd, callback){
    // qmgrCmd is optionnal so we test on the number of args
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
        args.push(arguments[i]);
    }

    // first argument is the config file
    pbs_config = args.shift();

    // last argument is the callback function
    callback = args.pop();
    
    var remote_cmd = pbs_config.binaries_dir + "qmgr -c ";
    if (args.length == 0){
        // Default print everything
        remote_cmd += "'p s'";
    }else{
        // TODO : handles complex qmgr commands
        remote_cmd += args.pop();
    }
    var output = spawnProcess(remote_cmd,"shell",pbs_config);
    
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr))
    }
    
    output = output.stdout.split('\n');
    var qmgrInfo = jsonifyQmgr(output);
    
    return callback(null, qmgrInfo);
}


// Interface for qsub
// Submit a script by its absolute path
// Takes as args an array of required files to run with and to send to the server with the script in 0
function qsub_js(pbs_config, qsubArgs, callback){
    var remote_cmd = pbs_config.binaries_dir + "qsub";
    if(qsubArgs.length < 1) {
        return { "code" : 1, "message" : 'Please submit the script to run'};  
    }
    
    // Create a workdir if not defined
    // TODO: - test if accessible
    var jobWorkingDir = createJobWorkDir(pbs_config);
    
    // Send files by the copy command defined
    for (var i = 0; i < qsubArgs.length; i++){
        var copyCmd = spawnProcess([qsubArgs[i],jobWorkingDir],"copy",pbs_config);
        if (copyCmd.stderr){
            return callback(new Error(copyCmd.stderr.replace(/\n/g,"")));
        }
    }
    // Add script
    var scriptName = qsubArgs[0].split("/").pop();
    remote_cmd += " " + jobWorkingDir + scriptName;
    
    // Add directory to submission args
    remote_cmd += " -d " + jobWorkingDir;
    
    // Submit
    var output = spawnProcess(remote_cmd,"shell",pbs_config);
    // Transmit the error if any
    if (output.stderr){
        return callback(new Error(output.stderr.replace(/\n/g,"")));
    }
    
    return callback(null, { 
            "message"   : 'Job ' + output.stdout.replace(/\n/g,"") + ' submitted',
            "path"      : jobWorkingDir
        });
}


module.exports = {
    qnodes_js           : qnodes_js,
    qstat_js            : qstat_js,
    qmgr_js             : qmgr_js,
    qdel_js             : qdel_js,
    qsub_js             : qsub_js,
    qscript_js          : qscript_js,
};