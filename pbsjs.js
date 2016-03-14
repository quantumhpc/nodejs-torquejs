var cproc = require('child_process');
var spawn = cproc.spawnSync;

// Load credentials to remotly connect to PBS server
var pbs_config = require("./config/pbsserver.json");

// Parse the command and return stdout of the process depending on the method
// TODO: treat errors
function spawnProcess(remote_cmd){
    remote_cmd = pbs_config.binaries_dir + remote_cmd;
    // Remote pbs server
    if (pbs_config.method == "ssh"){
        var spawnCommand = [pbs_config.username + "@" + pbs_config.serverName,"-i",pbs_config.secretAccessKey].concat(remote_cmd.split(" "));
        return spawn(pbs_config.ssh_exec, spawnCommand, { encoding : 'utf8' });
    }
    // Local server on the same machine as the node process
    if (pbs_config.method == "local"){
        return spawn(pbs_config.local_shell, remote_cmd.split(" "), { encoding : 'utf8' });
    }
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
        if (output[i].indexOf('=')!== -1){
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

// Return the list of nodes
function qnodes_js(nodeName){
    var remote_cmd = "qnodes";
    // Info on a specific node
    if(nodeName != undefined) {
        remote_cmd += " " + nodeName;
    }
    var output = spawnProcess(remote_cmd).stdout;
    //Detect empty values
    output = output.replace(/=,/g,"=null,");
    //Separate each node
    output = output.split('\n\n');
    var nodes = [];
    //Loop on each node, the last one is blank due to \n\n
    for (var i = 0; i < output.length-1; i++) {
        //Split at lign breaks
        output[i]  = output[i].trim().split(/[\n;]+/);
        nodes.push(jsonifyQnodes(output[i]));
    }
    return nodes;
}

// Return list of running jobs
// TODO: implement qstat -f
function qstat_js(jobId){
    var remote_cmd = "qstat";
    // Full information on a job
    if(jobId != undefined) {
        remote_cmd += " -f " + jobId;
    }
    var output = spawnProcess(remote_cmd).stdout;
    output = output.split('\n');
    // First 2 lines are not relevant
    var jobs = [];
    for (var i = 2; i < output.length-1; i++) {
        output[i]  = output[i].trim().split(/[\s]+/);
        jobs.push(jsonifyQstat(output[i]));
    }
    return jobs;
}

// Interface for qdel
// Delete the specified job Id and return the message and the status code
function qdel_js(jobId){
    var remote_cmd = "qdel";
    if(jobId == undefined) {
        return ['Please specify the jobId',1];
    }else{
        // Default print everything
        remote_cmd += " " + jobId;
    }
    var output = spawnProcess(remote_cmd);
    // Transmit the error if any
    if (output.stderr){
        return [output.stderr,output.status];
    }
    // Job deleted returns 0 exit code
    if (output.status == 0){
        return ['Job ' + jobId + ' successfully deleted',0];   
    }
}

// Interface for qmgr
// For now only display server info
function qmgr_js(qmgrCmd){
    var remote_cmd = "qmgr -c ";
    if(qmgrCmd != undefined) {
        remote_cmd += qmgrCmd;
    }else{
        // Default print everything
        remote_cmd += "'p s'";
    }
    var output = spawnProcess(remote_cmd).stdout;
    output = output.split('\n');
    var results = jsonifyQmgr(output);
    
    return results;
}

module.exports = {
    qnodes_js   : qnodes_js,
    qstat_js    : qstat_js,
    qmgr_js     : qmgr_js,
    qdel_js     : qdel_js,
};