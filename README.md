# nodejs-pbsjs
Nodejs module to interact with a PBS/Torque Server

## Introduction
For now only basic function are implemented: **qmgr -c 'p s'**, **qstat**, **qnodes** and **qnodes(nodename)**.
It uses SSH to remotly connect to the PBS/Torque headnode and return information as a JSON array.

## Basic usage
Edit `./config/pbsserver.json"` with your information
```
var pbsjs = require("./pbsjs.js")

var server_info = pbsjs.qmgr_js();
var nodes_info = pbsjs.qnodes_js();
var jobs_info = pbsjs.qstat_js();
```

### Output exemples
>qmgr_js:
```
[ queue: [ batch: [ queue_type: 'Execution',
      'resources_default.nodes': '1',
      'resources_default.walltime': '01:00:00',
      enabled: 'True',
      started: 'True' ] ],
  server: [ scheduling: 'True',
    acl_hosts: 'pbsserver',
    managers: 'root@pbsserver',
    operators: 'root@pbsserver',
    default_queue: 'batch',
    log_events: '2047',
    mail_from: 'adm',
    scheduler_iteration: '600',
    node_check_rate: '150',
    tcp_timeout: '300',
    job_stat_rate: '300',
    poll_jobs: 'True',
    down_on_error: 'True',
    mom_job_sync: 'True',
    keep_completed: '300',
    next_job_number: '4',
    moab_array_compatible: 'True',
    nppcu: '1',
    timeout_for_job_delete: '120',
    timeout_for_job_requeue: '120' ] ]
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
    macaddr: '00:00:00:00:00:00',
    cpuclock: 'Fixed',
    varattr: '',
    jobs: '',
    netload: '123456',
    gres: '',
    loadave: '0.07',
    ncpus: '4',
    physmem: '10000000kb',
    availmem: '10000000kb',
    totmem: '10000000kb',
    idletime: '100',
    nusers: '0',
    nsessions: '0',
    uname: 'Linux server_name 1.1.1-001.x86_64 #1 SMP Tue Jan 01 00:00:00 UTC 2016 x86_64',
    opsys: 'linux',
    mom_service_port: '15002',
    mom_manager_port: '15003' 
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
    },
    {
    jobId: '3.pbsserver',
    name: 'testJob2',
    user: 'user',
    time: '0',
    status: 'Queued',
    queue: 'batch' 
    }]
```
