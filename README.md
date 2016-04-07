# nodejs-pbsjs
Nodejs module to interact with a PBS/Torque Server

## Introduction
For now only basic function are implemented: **qmgr -c 'p s'**, **qstat**, **qdel(jobId)**, **qnodes** and **qnodes(nodename)**.
It uses SSH to remotly connect to the PBS/Torque headnode and return information as a JSON array.

Submit job remotly to a PBS/Torque server from a nodejs application and retrieve files from a working directory.

## Basic usage
Edit `./config/pbsserver.json"` with your information
```
var pbs_config = {
        "method"                : "ssh",
        "ssh_exec"              : "/usr/bin/ssh",
        "scp_exec"              : "/usr/bin/scp",
        "username"              : "user",
        "serverName"            : "pbsserver",
        "secretAccessKey"       : "/home/user/.ssh/id_rsa",
        "local_shell"           : "/bin/sh",
        "local_copy"            : "/bin/cp",
        "binaries_dir"          : "/usr/local/bin/",
        "useSharedDir"          : false,
        "working_dir"           : "/tmp"
};

var pbsjs = require("./pbsjs.js")
```
** Generate a submission script with the parameters in jobArgs and save it inside localJobDir**
```
pbsjs.qscript_js(jobArgs, localJobDir, callback(err,data))
```
** Submit a job with the following submissionScript and send the jobFiles along**
```
pbsjs.qsub_js(pbs_config, [submissionScript, jobFiles, ..], callback(err,data))
```
** Gather server information**
```
pbsjs.qmgr_js(pbs_config, callback);
```
** Gather node list**
```
pbsjs.qnodes_js(pbs_config, callback(err,data));
```
** Gather node info**
```
pbsjs.qnodes_js(pbs_config, nodeName, callback(err,data));
```
** Gather job list**
```
pbsjs.qstat_js(pbs_config, callback(err,data));
```
** Gather job information**
```
pbsjs.qstat_js(pbs_config, jobId, callback(err,data));
```
** List files in working directory**
```
pbsjs.qfind_js(pbs_config, jobId, callback(err,data));
```
** Download files from a working directory to the localJobDir**
```
pbsjs.qretrieve_js(pbs_config, jobId, [jobFiles,..] , localJobDir, callback(err,data))
```
** Cancel a job**
```
pbsjs.qdel_js(pbs_config, jobId, callback(err,data))
```

### Output exemples
>qmgr_js:
```
[ queues: [ { queue_type: 'Execution',
      'resources_default.nodes': '1',
      'resources_default.walltime': '01:00:00',
      enabled: 'True',
      started: 'True',
      name: 'batch' } ],
  server: { scheduling: 'True',
    acl_hosts: 'pbsserver',
    managers: 'root@pbsserver',
    ...} ]
```

>qnodes_js:
```
[ { 
    name: 'node1',
    state: 'free',
    power_state: 'Running',
    np: '1',
    ntype: 'cluster',
    status: 'rectime',
    ...
    uname: 'Linux server_name 1.1.1-001.x86_64 #1 SMP Tue Jan 01 00:00:00 UTC 2016 x86_64',
    opsys: 'linux'
    },
    {
    name: 'node2',
    state: 'down',
    power_state: 'Running',
    np: '1',
    ntype: 'cluster',
    mom_service_port: '15002',
    mom_manager_port: '15003' 
    } ]
```

>qstat_js:
```
[ {
    jobId: '0.pbsserver',
    name: 'testJob0',
    user: 'user',
    time: '0',
    status: 'Completed',
    queue: 'batch' 
    },
    {
    jobId: '1.pbsserver', 
    name: 'testJob1',
    user: 'user',
    time: '0',
    status: 'Running',
    queue: 'batch' 
    }]
```

>qqueues_js:
```
[ { name: 'batch',
    maxJobs: '0',
    totalJobs: '2',
    enabled: true,
    started: true,
    queued: '2',
    running: '0',
    held: '0',
    waiting: '0',
    moving: '0',
    exiting: '0',
    type: 'Execution',
    completed: '0' },
  { name: 'interactive',
    maxJobs: '0',
    totalJobs: '0',
    enabled: true,
    started: true,
    queued: '0',
    running: '0',
    held: '0',
    waiting: '0',
    moving: '0',
    exiting: '0',
    type: 'Execution',
    completed: '0' } ]