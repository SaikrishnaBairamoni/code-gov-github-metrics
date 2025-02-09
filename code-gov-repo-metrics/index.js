// Use dotenv package to get GitHub Personal Access Token from .env
require('dotenv').config();

// Use graphql-request package to make requests to the GitHub GraphQL API
const { GraphQLClient } = require('graphql-request');

// Grab config.json where the list of repositories to query is stored
const CONFIG = require('./config.json');

// Grab queries.js where the GitHub GraphQL queries are stored
var queries = require('./queries.js');

// Import utils functions from utils.js
var utils = require('./utils.js');

/**
 * Queries the GitHub API for information about a 
 * specific repo and returns the resulting data.
 * 
 * @param {String} repoName repo to query
 *
 * @return {JSON} the data for the repo
 */
async function queryGitHub(repoName) {
    const endpoint = 'https://api.github.com/graphql';

    // Create a graphQLClient
    const graphQLClient = new GraphQLClient(endpoint, {
        headers: {
            authorization: 'Bearer ' + process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
        },
    });

    // Get the main query from queries.js
    const query = queries.mainQuery;

    // Set the query variables
    const variables = {
        owner: CONFIG.owner,
        repo: repoName
    };

    // Request the data
    const dataJSON = await graphQLClient.request(query, variables);

    // If the repo has more than 100 issues, get the rest of the issues
    if (dataJSON.repository.issues.pageInfo.hasNextPage) {
        var issues = await queryIssuesDeep(repoName, dataJSON.repository.issues.pageInfo.endCursor, dataJSON.repository.issues.nodes);
        dataJSON.repository.issues.nodes = issues;
    }

    // If the repo has more than 100 pull requests, get the rest of the pull requests
    if (dataJSON.repository.pullRequests.pageInfo.hasNextPage) {
        var pullRequests = await queryPullRequestsDeep(repoName, dataJSON.repository.pullRequests.pageInfo.endCursor, dataJSON.repository.pullRequests.nodes);
        dataJSON.repository.pullRequests.nodes = pullRequests;
    }

    return dataJSON;
}

/**
 * Recursively queries GitHub for 100 additional issues
 * until all of the issues have been retrieved.
 * 
 * @param {String} repoName repo to query
 * @param {String} cursor index of issue to start at
 * @param {Array} issues running list of issues
 *
 * @return {Array} all the issues for the repo
 */
async function queryIssuesDeep(repoName, cursor, issues) {
    const endpoint = 'https://api.github.com/graphql';
  
    // Create a graphQLClient
    const graphQLClient = new GraphQLClient(endpoint, {
        headers: {
            authorization: 'Bearer ' + process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
        },
    });
  
    // Get the issues query from queries.js
    const query = queries.issuesQuery;
  
    // Set the query variables
    const variables = {
        owner: CONFIG.owner,
        repo: repoName,
        cursor: cursor
    };
  
    // Request the additional issues
    const dataJSON = await graphQLClient.request(query, variables);

    // Push the new issues to the running issue list
    dataJSON.repository.issues.nodes.forEach(issue => {issues.push(issue)});

    // Recurse if there are still more issues
    if (dataJSON.repository.issues.pageInfo.hasNextPage) {
        return await queryIssuesDeep(repoName, dataJSON.repository.issues.pageInfo.endCursor, issues);
    }

    return issues;
}

/**
 * Recursively queries GitHub for 100 additional pull requests
 * until all of the pull requests have been retrieved.
 * 
 * @param {String} repoName repo to query
 * @param {String} cursor index of pull request to start at
 * @param {Array} pullRequests running list of pull requests
 *
 * @return {Array} all the pull requests for the repo
 */
async function queryPullRequestsDeep(repoName, cursor, pullRequests) {
    const endpoint = 'https://api.github.com/graphql';
  
    // Create a graphQLClient
    const graphQLClient = new GraphQLClient(endpoint, {
        headers: {
            authorization: 'Bearer ' + process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
        },
    });

    // Get the pull requests query from queries.js
    const query = queries.pullRequestsQuery;
  
    // Set the query variables
    const variables = {
        owner: CONFIG.owner,
        repo: repoName,
        cursor: cursor
    };

    // Request the additional pull requests
    const dataJSON = await graphQLClient.request(query, variables);

    // Push the new pull requests to the running pull requests list
    dataJSON.repository.pullRequests.nodes.forEach(pullRequest => {pullRequests.push(pullRequest)});

    // Recurse if there are still more pull requests
    if (dataJSON.repository.pullRequests.pageInfo.hasNextPage) {
        return await queryIssuesDeep(repoName, dataJSON.repository.pullRequests.pageInfo.endCursor, pullRequests);
    }

    return pullRequests;
}

/**
 * Processes the raw repo data from GitHub by calculating 
 * the relevant metrics and returning a JSON of these metrics
 * for the .csv report.
 * 
 * @param {JSON} repo raw data from GitHub API
 *
 * @return {JSON} a JSON of metrics calculated for repo
 */
function processRepo(repo) {
    // Set up
    var issueMetaData = getIssueMetaData(repo);
    var pullRequestMetaData = getPullRequestMetaData(repo);
    var contributorsListAllTime = utils.unionSets(issueMetaData.contributorsListAllTime, pullRequestMetaData.contributorsListAllTime);
    var contributorsListAllTimeInteral = utils.unionSets(issueMetaData.contributorsListAllTimeInternal, pullRequestMetaData.contributorsListAllTimeInternal);
    var contributorsListAllTimeExternal = utils.unionSets(issueMetaData.contributorsListAllTimeExternal, pullRequestMetaData.contributorsListAllTimeExternal);
    var contributorsListThisPeriod = utils.unionSets(issueMetaData.contributorsListThisPeriod, pullRequestMetaData.contributorsListThisPeriod);
    var contributorsListThisPeriodInternal = utils.unionSets(issueMetaData.contributorsListThisPeriodInternal, pullRequestMetaData.contributorsListThisPeriodInternal);
    var contributorsListThisPeriodExternal = utils.unionSets(issueMetaData.contributorsListThisPeriodExternal, pullRequestMetaData.contributorsListThisPeriodExternal);
    var contributorsListThisPeriodFirstTimeContributor = utils.unionSets(issueMetaData.contributorsListThisPeriodFirstTimeContributor, pullRequestMetaData.contributorsListThisPeriodFirstTimeContributor);
    
    // Make JSON of processed data
    var repoData = {
        repo: repo.repository.name,

        // These metrics are for all time as of the time of the script running
        stars: utils.getStarCount(repo),
        watches: utils.getWatchCount(repo),
        forks: utils.getForkCount(repo),
        issues: utils.getIssueCount(repo),
        internalIssues: issueMetaData.internalIssues,
        externalIssues: issueMetaData.externalIssues,
        openIssues: issueMetaData.openIssues,
        staleIssues: issueMetaData.staleIssues,
        percentStaleIssues: issueMetaData.openIssues === 0 ? "N/A" : utils.toPercent(issueMetaData.staleIssues / issueMetaData.openIssues),
        oldIssues: issueMetaData.oldIssues,
        percentOldIssues: issueMetaData.openIssues === 0 ? "N/A" : utils.toPercent(issueMetaData.oldIssues / issueMetaData.openIssues),
        percentIssuesClosedByPullRequest: issueMetaData.closedIssuesTotal === 0 ? "N/A" : utils.toPercent(issueMetaData.closedByPullRequestIssues / issueMetaData.closedIssuesTotal),
        averageIssueOpenTime: utils.averageList(issueMetaData.openTimes),
        pullRequests: utils.getPullRequestCount(repo),
        internalPullRequests: pullRequestMetaData.internalPullRequests,
        externalPullRequests: pullRequestMetaData.externalPullRequests,
        openPullRequests: pullRequestMetaData.openPullRequests,
        averagePullRequestMergeTime: utils.averageList(pullRequestMetaData.openTimes),
        contributorsAllTime: contributorsListAllTime.size,
        contributorsAllTimeInternal: contributorsListAllTimeInteral.size,
        contributorsAllTimeExternal: contributorsListAllTimeExternal.size,

        // These lists are included in repoData (but not the final .csv) to help with aggregation
        issueOpenTimes: issueMetaData.openTimes,
        closedByPullRequestIssues: issueMetaData.closedByPullRequestIssues,
        closedIssuesTotal: issueMetaData.closedIssuesTotal,
        pullRequestOpenTimes: pullRequestMetaData.openTimes,
        contributorsListAllTime: contributorsListAllTime,
        contributorsListAllTimeInternal: contributorsListAllTimeInteral,
        contributorsListAllTimeExternal: contributorsListAllTimeExternal,
        contributorsListThisPeriod: contributorsListThisPeriod,
        contributorsListThisPeriodInternal: contributorsListThisPeriodInternal,
        contributorsListThisPeriodExternal: contributorsListThisPeriodExternal,
        contributorsListThisPeriodFirstTimeContributor: contributorsListThisPeriodFirstTimeContributor,

        // These metrics are for the time period provided through command line arguments
        openedIssues: issueMetaData.openedIssues,
        openedIssuesInternal: issueMetaData.openedIssuesInternal,
        openedIssuesExternal: issueMetaData.openedIssuesExternal,
        openedIssuesFirstTimeContributor: issueMetaData.openedIssuesFirstTimeContributor,
        closedIssues: issueMetaData.closedIssues,
        openedPullRequests: pullRequestMetaData.openedPullRequests,
        openedPullRequestsInternal: pullRequestMetaData.openedPullRequestsInternal,
        openedPullRequestsExternal: pullRequestMetaData.openedPullRequestsExternal,
        openedPullRequestsFirstTimeContributor: pullRequestMetaData.openedPullRequestsFirstTimeContributor,
        mergedPullRequests: pullRequestMetaData.mergedPullRequests,
        closedPullRequests: pullRequestMetaData.closedPullRequests,
        contributorsThisPeriod: contributorsListThisPeriod.size,
        contributorsThisPeriodInternal: contributorsListThisPeriodInternal.size,
        contributorsThisPeriodExternal: contributorsListThisPeriodExternal.size,
        contributorsThisPeriodFirstTimeContributor: contributorsListThisPeriodFirstTimeContributor.size
    };
    
    return repoData;
}

/**
 * Calculates issue meta deta for a repo (e.g. number
 * of open issues)
 * 
 * @param {JSON} repo raw data from GitHub API
 *
 * @return {JSON} a JSON of metrics calculated for the issues 
 * of that repo
 */
function getIssueMetaData(repo) {
    // Set up
    var internalIssues = 0;
    var externalIssues = 0;
    var openIssues = 0;
    var staleIssues = 0;
    var oldIssues = 0;
    var closedByPullRequestIssues = 0;
    var closedIssuesTotal = 0;
    var openedIssues = 0;
    var openedIssuesInternal = 0;
    var openedIssuesExternal = 0;
    var openedIssuesFirstTimeContributor = 0;
    var closedIssues = 0;
    var openTimes = [];
    var contributorsListAllTime = new Set();
    var contributorsListAllTimeInternal = new Set();
    var contributorsListAllTimeExternal = new Set();
    var contributorsListThisPeriod = new Set();
    var contributorsListThisPeriodInternal = new Set();
    var contributorsListThisPeriodExternal = new Set();
    var contributorsListThisPeriodFirstTimeContributor = new Set();

    // Iterate through each issue of the repo
    repo.repository.issues.nodes.forEach(function(issue) {
        // Add contributor to all time contributors list
        contributorsListAllTime.add(issue.author.login);
        
        // Add contributor to all time internal/external contributor list
        if (utils.authorIsInternal(issue.authorAssociation)) {
            contributorsListAllTimeInternal.add(issue.author.login);
            internalIssues += 1;
        }
        if (utils.authorIsExternal(issue.authorAssociation)) {
            contributorsListAllTimeExternal.add(issue.author.login);
            externalIssues += 1;
        }

        // Calculate the time created for use later on
        var timeCreated = new Date(issue.createdAt);

        if (issue.state === "OPEN") {
            openIssues += 1;
            var timelineEvents = issue.timelineItems.nodes;
            var lastTimelineEvent = timelineEvents[timelineEvents.length - 1];
            // Last event is either the last event in the timeline or the creation of the issue
            var lastEventDate = (lastTimelineEvent) ? lastTimelineEvent.createdAt : issue.createdAt;
            lastEventDate = new Date(lastEventDate);

            // Determine if issue is stale (no activity for >14 days)
            if (utils.millisecondsToDays(Date.now() - lastEventDate) > 14) {
                staleIssues += 1;
            }

            // Determine if issue is old (open for >120 days)
            if (utils.millisecondsToDays(Date.now() - timeCreated) > 120) {
                oldIssues += 1;
            }
        }

        // Check if issue was created during the time period specified
        if (timeCreated > START_DATE && timeCreated < END_DATE) {
            openedIssues += 1;

            // Add contributor to this period's contributors list
            contributorsListThisPeriod.add(issue.author.login);

            // Add contributor to this period's internal/external/first time contributor list
            if (utils.authorIsInternal(issue.authorAssociation)) {
                openedIssuesInternal += 1;
                contributorsListThisPeriodInternal.add(issue.author.login);
            }
            if (utils.authorIsExternal(issue.authorAssociation)) {
                openedIssuesExternal += 1;
                contributorsListThisPeriodExternal.add(issue.author.login);
            }
            if (utils.authorIsFirstTimeContributor(issue.authorAssociation)){
                openedIssuesFirstTimeContributor += 1;
                contributorsListThisPeriodFirstTimeContributor.add(issue.author.login);
            }
        }

        if (issue.closedAt) {
            closedIssuesTotal += 1;

            var timeClosed = new Date(issue.closedAt);

            // Check if issue was closed during the time period specified
            if (timeClosed > START_DATE && timeClosed < END_DATE) {
                closedIssues += 1;
            }

            // Calculate time open in days
            var timeOpen = utils.millisecondsToDays(timeClosed - timeCreated);
            openTimes.push(timeOpen);

            /** 
             * Use this in case there are multiple closed events - uses the last one to determine
             * if the issue was closed by PR
             * */ 
            var closedByPullRequest = false;
            issue.timelineItems.nodes.forEach(function(timelineItem) {
                if (timelineItem.__typename === "ClosedEvent") {
                    if (timelineItem.closer && timelineItem.closer.__typename === "PullRequest") {
                        closedByPullRequest = true;
                    }
                }
            });
            if (closedByPullRequest) {
                closedByPullRequestIssues += 1;
            }
        }
    });
    return {
        internalIssues: internalIssues,
        externalIssues: externalIssues,
        openIssues: openIssues,
        staleIssues: staleIssues,
        oldIssues: oldIssues,
        closedByPullRequestIssues: closedByPullRequestIssues,
        closedIssuesTotal: closedIssuesTotal,
        openedIssues: openedIssues,
        openedIssuesInternal: openedIssuesInternal,
        openedIssuesExternal: openedIssuesExternal,
        openedIssuesFirstTimeContributor: openedIssuesFirstTimeContributor,
        closedIssues: closedIssues,
        openTimes: openTimes,
        contributorsListAllTime: contributorsListAllTime,
        contributorsListAllTimeInternal: contributorsListAllTimeInternal,
        contributorsListAllTimeExternal: contributorsListAllTimeExternal,
        contributorsListThisPeriod: contributorsListThisPeriod,
        contributorsListThisPeriodInternal: contributorsListThisPeriodInternal,
        contributorsListThisPeriodExternal: contributorsListThisPeriodExternal,
        contributorsListThisPeriodFirstTimeContributor: contributorsListThisPeriodFirstTimeContributor
    };
}

/**
 * Calculates pull request meta deta for a repo (e.g. number
 * of open pull requests)
 * 
 * @param {JSON} repo raw data from GitHub API
 *
 * @return {JSON} a JSON of metrics calculated for the pull requests 
 * of that repo
 */
function getPullRequestMetaData(repo) {
    // Set up 
    var internalPullRequests = 0;
    var externalPullRequests = 0;
    var openPullRequests = 0;
    var openedPullRequests = 0;
    var openedPullRequestsInternal = 0;
    var openedPullRequestsExternal = 0;
    var openedPullRequestsFirstTimeContributor = 0;
    var mergedPullRequests = 0;
    var closedPullRequests = 0;
    var openTimes = [];
    var contributorsListAllTime = new Set();
    var contributorsListAllTimeInternal = new Set();
    var contributorsListAllTimeExternal = new Set();
    var contributorsListThisPeriod = new Set();
    var contributorsListThisPeriodInternal = new Set();
    var contributorsListThisPeriodExternal = new Set();
    var contributorsListThisPeriodFirstTimeContributor = new Set();

    // Iterate through each pull request of the repo
    repo.repository.pullRequests.nodes.forEach(function(pullRequest) {
        // Add contributor to all time contributors list
       if(pullRequest.author == null)
        {
            console.error("**************PR NULL LOGIN HERE****************");
            console.log(pullRequest);
            //there were some ghost users
            /**
             * https://github.com/usdot-jpo-ode/jpo-ode/pull/166
             */
            return;
        }
        contributorsListAllTime.add(pullRequest.author.login);

        // Add contributor to all time internal/external contributor list
        if (utils.authorIsInternal(pullRequest.authorAssociation)) {
            contributorsListAllTimeInternal.add(pullRequest.author.login);
            internalPullRequests += 1;
        }
        if (utils.authorIsExternal(pullRequest.authorAssociation)) {
            contributorsListAllTimeExternal.add(pullRequest.author.login);
            externalPullRequests += 1;
        }

        // Calculate the time created for use later on
        var timeCreated = new Date(pullRequest.createdAt);
       
        if (pullRequest.state === "OPEN") {
            openPullRequests += 1;
        }

        // Check if pull request was created during the time period specified
        if (timeCreated > START_DATE && timeCreated < END_DATE) {
            openedPullRequests += 1;

            // Add contributor to this period's contributors list
            contributorsListThisPeriod.add(pullRequest.author.login);

            // Add contributor to this period's internal/external/first time contributor list
            if (utils.authorIsInternal(pullRequest.authorAssociation)) {
                openedPullRequestsInternal += 1;
                contributorsListThisPeriodInternal.add(pullRequest.author.login);
            }
            if (utils.authorIsExternal(pullRequest.authorAssociation)) {
                openedPullRequestsExternal += 1;
                contributorsListThisPeriodExternal.add(pullRequest.author.login);
            }
            if (utils.authorIsFirstTimeContributor(pullRequest.authorAssociation)){
                openedPullRequestsFirstTimeContributor += 1;
                contributorsListThisPeriodFirstTimeContributor.add(pullRequest.author.login);
            }
        }

        // Check if pull request was merged during the time period specified
        if (pullRequest.mergedAt && pullRequest.state === "MERGED") {
            var timeMerged = new Date(pullRequest.mergedAt);
            if (timeMerged > START_DATE && timeMerged < END_DATE) {
                mergedPullRequests += 1;
            }
            // Calculate time open in days
            var timeOpen = utils.millisecondsToDays(timeMerged - timeCreated);
            openTimes.push(timeOpen);
        }

        // Check if pull request was closed during the time period specified
        if (pullRequest.closedAt && pullRequest.state === "CLOSED") {
            var timeClosed = new Date(pullRequest.closedAt);
            if (timeClosed > START_DATE && timeClosed < END_DATE) {
                closedPullRequests += 1;
            }
        }
    });
    return {
        internalPullRequests: internalPullRequests,
        externalPullRequests: externalPullRequests,
        openPullRequests: openPullRequests,
        openedPullRequests: openedPullRequests,
        openedPullRequestsInternal: openedPullRequestsInternal,
        openedPullRequestsExternal: openedPullRequestsExternal,
        openedPullRequestsFirstTimeContributor: openedPullRequestsFirstTimeContributor,
        mergedPullRequests: mergedPullRequests,
        closedPullRequests: closedPullRequests,
        openTimes: openTimes,
        contributorsListAllTime: contributorsListAllTime,
        contributorsListAllTimeInternal: contributorsListAllTimeInternal,
        contributorsListAllTimeExternal: contributorsListAllTimeExternal,
        contributorsListThisPeriod: contributorsListThisPeriod,
        contributorsListThisPeriodInternal: contributorsListThisPeriodInternal,
        contributorsListThisPeriodExternal: contributorsListThisPeriodExternal,
        contributorsListThisPeriodFirstTimeContributor: contributorsListThisPeriodFirstTimeContributor
    };
}

/**
 * Aggregate data across all of the processed repos
 * to calculate total metrics.
 * 
 * @param {Array} repos list of processed repo data
 *
 * @return {JSON} a JSON of metrics calculated for all repos
 */
function aggregateRepoData(repos) {
    // Set up
    var openIssues = utils.sumList(repos.map(repo => repo.openIssues));
    var staleIssues = utils.sumList(repos.map(repo => repo.staleIssues));
    var oldIssues = utils.sumList(repos.map(repo => repo.oldIssues));

    // Make JSON of aggregate processed data
    var totalData = {
        repo: "TOTAL",

        // These metrics are for all time as of the time of the script running
        stars: utils.sumList(repos.map(repo => repo.stars)),
        watches: utils.sumList(repos.map(repo => repo.watches)),
        forks: utils.sumList(repos.map(repo => repo.forks)),
        issues: utils.sumList(repos.map(repo => repo.issues)),
        internalIssues: utils.sumList(repos.map(repo => repo.internalIssues)),
        externalIssues: utils.sumList(repos.map(repo => repo.externalIssues)),
        openIssues: openIssues,
        staleIssues: staleIssues,
        percentStaleIssues: utils.toPercent(staleIssues / openIssues),
        oldIssues: oldIssues,
        percentOldIssues: utils.toPercent(oldIssues / openIssues), 
        percentIssuesClosedByPullRequest: utils.toPercent(utils.sumList(repos.map(repo => repo.closedByPullRequestIssues))/ utils.sumList(repos.map(repo => repo.closedIssuesTotal))),
        averageIssueOpenTime: utils.averageList(utils.concatenateLists(repos.map(repo => repo.issueOpenTimes))),
        pullRequests: utils.sumList(repos.map(repo => repo.pullRequests)),
        internalPullRequests: utils.sumList(repos.map(repo => repo.internalPullRequests)),
        externalPullRequests: utils.sumList(repos.map(repo => repo.externalPullRequests)),
        openPullRequests: utils.sumList(repos.map(repo => repo.openPullRequests)),
        averagePullRequestMergeTime: utils.averageList(utils.concatenateLists(repos.map(repo => repo.pullRequestOpenTimes))),
        contributorsAllTime: utils.unionSetSize(repos.map(repo => repo.contributorsListAllTime)),
        contributorsAllTimeInternal: utils.unionSetSize(repos.map(repo => repo.contributorsListAllTimeInternal)),
        contributorsAllTimeExternal: utils.unionSetSize(repos.map(repo => repo.contributorsListAllTimeExternal)),

        // These metrics are for the time period provided through command line arguments
        openedIssues: utils.sumList(repos.map(repo => repo.openedIssues)),
        openedIssuesInternal: utils.sumList(repos.map(repo => repo.openedIssuesInternal)),
        openedIssuesExternal: utils.sumList(repos.map(repo => repo.openedIssuesExternal)),
        openedIssuesFirstTimeContributor: utils.sumList(repos.map(repo => repo.openedIssuesFirstTimeContributor)),
        closedIssues: utils.sumList(repos.map(repo => repo.closedIssues)),
        openedPullRequests: utils.sumList(repos.map(repo => repo.openedPullRequests)),
        openedPullRequestsInternal: utils.sumList(repos.map(repo => repo.openedPullRequestsInternal)),
        openedPullRequestsExternal: utils.sumList(repos.map(repo => repo.openedPullRequestsExternal)),
        openedPullRequestsFirstTimeContributor: utils.sumList(repos.map(repo => repo.openedPullRequestsFirstTimeContributor)),
        mergedPullRequests: utils.sumList(repos.map(repo => repo.mergedPullRequests)),
        closedPullRequests: utils.sumList(repos.map(repo => repo.closedPullRequests)),
        contributorsThisPeriod: utils.unionSetSize(repos.map(repo => repo.contributorsListThisPeriod)),
        contributorsThisPeriodInternal: utils.unionSetSize(repos.map(repo => repo.contributorsListThisPeriodInternal)),
        contributorsThisPeriodExternal: utils.unionSetSize(repos.map(repo => repo.contributorsListThisPeriodExternal)),
        contributorsThisPeriodFirstTimeContributor: utils.unionSetSize(repos.map(repo => repo.contributorsListThisPeriodFirstTimeContributor))
    };
    return totalData;
}

/**
 * Queries GitHub for information about each repository,
 * processes that data, and sends it to a helper function
 * to write it to a .csv report
 */
async function fetchProcessAndWriteGitHubData() {
    // Get list of repos from config.json
    repos = CONFIG.repoList;
    var githubPromise;
    var promises = [];

    console.log("Querying GitHub for information about these repositories:");

    // Query github for information about each repo and store the promises
    repos.forEach(async function(repo) {
        console.log(repo);
        githubPromise = queryGitHub(repo).catch(error => console.error(error));
        promises.push(githubPromise);
    });

    console.log();
    console.log("Processing repository data ...")

    /** 
     * Once all of the promises have resolved, process each repo to create
     * an array of processed repo data (for the .csv report). Aggregate the
     * data across repos into a final entry in the data (for overall numbers)
     * and then write the data to a .csv file
     */
    Promise.all(promises).then(function(repos) {
        var data = repos.map(repo => processRepo(repo));
        var aggregatedData = aggregateRepoData(data);
        data.push(aggregatedData);
        writeCSV(data);
    });
    console.log();
}

/**
 * Writes the data for each repo as well as all repos into
 * a .csv report in the reports folder.
 * 
 * @param {Array} data data for each repo + all repos
 */
async function writeCSV(data) {
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;

    // Format filename
    const now = new Date();
    const dateString = utils.formatDate(now);
    const periodString = utils.formatDate(START_DATE) + " -> " + utils.formatDate(END_DATE);
    const filePath = 'reports/' + dateString + " | " + periodString + '.csv';

    // Make CSV writer with the column ids and headings
    const csvWriter = createCsvWriter({
        path: filePath,
        header: [
            {id: 'repo', title: 'Repo Name'},

            // These metrics are for all time as of the time of the script running
            {id: 'stars', title: 'Stars'},
            {id: 'watches', title: 'Watches'},
            {id: 'forks', title: 'Forks'},
            {id: 'issues', title: 'Issues'},
            {id: 'internalIssues', title: 'Issues (Internal)'},
            {id: 'externalIssues', title: 'Issues (External)'},
            {id: 'openIssues', title: 'Open Issues'},
            {id: 'staleIssues', title: 'Stale Issues (No activity for >14 days)'},
            {id: 'percentStaleIssues', title: '% Stale Issues'},
            {id: 'oldIssues', title: 'Old Issues (Open for >120 days)'},
            {id: 'percentOldIssues', title: '% Old Issues'},
            {id: 'percentIssuesClosedByPullRequest', title: '% Issues Closed by Pull Request'},
            {id: 'averageIssueOpenTime', title: 'Average Issue Open Time (Days)'},
            {id: 'pullRequests', title: 'Pull Requests'},
            {id: 'internalPullRequests', title: 'Pull Requests (Internal)'},
            {id: 'externalPullRequests', title: 'Pull Requests (External)'},
            {id: 'openPullRequests', title: 'Open Pull Requests'},
            {id: 'averagePullRequestMergeTime', title: 'Average Pull Request Time to Merge (Days)'},
            {id: 'contributorsAllTime', title: 'Contributors (All Time)'},
            {id: 'contributorsAllTimeInternal', title: 'Contributors (All Time - Internal)'},
            {id: 'contributorsAllTimeExternal', title: 'Contributors (All Time - External)'},

            // These metrics are for the time period provided through command line arguments
            {id: 'openedIssues', title: 'Issues Opened'},
            {id: 'openedIssuesInternal', title: 'Issues Opened (Internal)'},
            {id: 'openedIssuesExternal', title: 'Issues Opened (External)'},
            {id: 'openedIssuesFirstTimeContributor', title: 'Issues Opened (First Time Contributor)'},
            {id: 'closedIssues', title: 'Issues Closed'},
            {id: 'openedPullRequests', title: 'Pull Requests Opened'},
            {id: 'openedPullRequestsInternal', title: 'Pull Requests Opened (Internal)'},
            {id: 'openedPullRequestsExternal', title: 'Pull Requests Opened (External)'},
            {id: 'openedPullRequestsFirstTimeContributor', title: 'Pull Requests Opened (First Time Contributor)'},
            {id: 'mergedPullRequests', title: 'Pull Requests Merged'},
            {id: 'closedPullRequests', title: 'Pull Requests Closed'},
            {id: 'contributorsThisPeriod', title: 'Contributors (This Period)'},
            {id: 'contributorsThisPeriodInternal', title: 'Contributors (This Period - Internal)'},
            {id: 'contributorsThisPeriodExternal', title: 'Contributors (This Period - External)'},
            {id: 'contributorsThisPeriodFirstTimeContributor', title: 'Contributors (This Period - First Time Contributor)'}
        ]
    });

    // Write the .csv file and log when successful
    csvWriter.writeRecords(data).then(() => console.log('The CSV file ("' + filePath + '") was written successfully'));
}

// Create global START_DATE and END_DATE variables to be set in the validateCommandLineArguments function
var START_DATE;
var END_DATE;

/**
 * Validate that the command line arguments are correct and set START_DATE and END_DATE
 *
 * Ensures that command line arguments are correct (correct # of arguments, correct format, 
 * valid dates, start date before end date)
 *
 * @return {Boolean} Are the command line arguments valid?
 */
function validateCommandLineArguments() {
    // Validate that there are 4 command line arguments (first 2 are always path to node executable and path to script file)
    if (process.argv.length != 4) {
        console.log("Invalid inputs - please provide exactly 2 command line arguments (start date and end date).");
        utils.logExampleCommandLineArguments();
        return false;
    }

    // Validate that the command line arguments are in the right form
    if (!utils.isValidDateString(process.argv[2]) || !utils.isValidDateString(process.argv[3])) {
        console.log("Invalid inputs - please provide dates in the format YYYY-MM-DD.");
        utils.logExampleCommandLineArguments();
        return false;
    }

    /**
     * Make date objects from the command line arguments
     * The added time (" 00:00:00") is to fix a small bug in the way the Date is parsed for the .csv file name
     */ 
    START_DATE = new Date(process.argv[2] + " 00:00:00");
    END_DATE = new Date(process.argv[3] + " 00:00:00");

    // Validate that start date is a valid date
    if (!utils.isValidDate(START_DATE)) {
        console.log("Invalid inputs - please provide a valid start date in the format YYYY-MM-DD.");
        utils.logExampleCommandLineArguments();
        return false;
    }

    // Validate that end date is a valid date
    if (!utils.isValidDate(END_DATE)) {
        console.log("Invalid inputs - please provide a valid end date in the format YYYY-MM-DD.");
        utils.logExampleCommandLineArguments();
        return false;
    }

    // Validate that there is at least 1 day between the start and end date
    if (utils.millisecondsToDays(END_DATE - START_DATE) < 1) {
        console.log("Invalid inputs - end date must be at least one day after start date.");
        utils.logExampleCommandLineArguments();
        return false;
    }

    // Command line arguments have been validated
    return true;
}

// Validate command line arguments before starting the main process
if (validateCommandLineArguments()) {
    // Start the main process
    fetchProcessAndWriteGitHubData();
}
   
