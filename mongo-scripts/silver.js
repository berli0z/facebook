#!/usr/bin/env nodejs
/* this is a script intended to extract section of the dataset
 * to feed analysis tool like tableau.
 *
 * Environment variable:
 *
 * STARTDAY YYYY-MM-DD 
 * ENDDAY YYYY-MM-DD
 * TIMEF,
 * HTMLF
 * concurrency 
 * */

var _ = require('lodash');
var Promise = require('bluebird');
var fs = Promise.promisifyAll(require('fs'));
var debug = require('debug')('silver');
var moment = require('moment');
var nconf = require('nconf');
var fs = Promise.promisifyAll(require('fs'));

var utils = require('../lib/utils');
var mongo = require('../lib/mongo');
var various = require('../lib/various');

var cfgFile = "config/settings.json";
nconf.argv().env().file({ file: cfgFile });

if(!(nconf.get("STARTDAY") || nconf.get("ENDDAY") || nconf.get("TIMEF") || nconf.get("HTMLF"))) {
    console.log("STARTDAY, ENDDAY, TIMEF (timeline), HTMLF");
    process.exit(1);
}

var timeFilter = { 
    start: moment(nconf.get('STARTDAY')),
    end: moment(nconf.get('ENDDAY'))
}

var timediff = moment.duration(timeFilter.end - timeFilter.start);
var destFile = "extracted-" + timediff.humanize() + ".json";

var timef = nconf.get('TIMEF') || '{}';
timef = JSON.parse(timef);
var htmlf = nconf.get('HTMLF') || '{}';
htmlf = JSON.parse(htmlf);

debug("Executing timewindow: %s %s timeline filter %s, htmls filter %s +feed only",
    JSON.stringify(timeFilter, undefined, 2),
    timediff.humanize(),
    JSON.stringify(timef, undefined, 2),
    JSON.stringify(htmlf, undefined, 2) );

var patterns = {
    /* the regexp is case insensitive and global, because we want a count */
    "Nisman": new RegExp("Nisman", 'ig'),
    "Maldonado": new RegExp("Maldonado", 'ig'),
    "Kirchner": new RegExp("Kirchner", 'ig'),
    "Bullrich": new RegExp("Bullrich", 'ig'),
    "Massa": new RegExp("Massa", 'ig')
};

function patternMap(htmlstring) {

    return _.reduce(patterns, function(memo, re, pattern) {
        var matches = htmlstring.match(re);
        var l = matches ? matches.length : 0;
        _.set(memo, pattern, l);
        return memo;
    }, {});
};

function lookintoHTMLs(timeline, counter) {

    return Promise.all([
        mongo.read(nconf.get('schema').htmls, {
            timelineId: timeline.id,
            publicationUTime: { "$exists": true }
        }, { savingTime: -1 }),
        mongo.read(nconf.get('schema').impressions, {
            timelineId: timeline.id
        }),
        timeline.name
    ])
    .then(function(combos) {
/*
        debug("htmls %d, impressions %d, %s timeline %s of %s",
            _.size(combos[0]), _.size(combos[1]), combos[2],
            timeline.id, timeline.name);
*/
        if(_.size(combos[0]) < 3)
            return [];

        return _.map(combos[0], function(html, i) {

            var impression = _.find(combos[1], { htmlId: html.id });
            var ret = new Object();

            if(html.permaLink) {
                if(html.hrefType === "groupPost")
                    ret.pageName = html.permaLink.split('/')[2];
                else
                    ret.pageName = html.permaLink.split('/')[1];
            }

            ret.profile = combos[2];

            if(!html.postId) {
                debug("Warning, no postId in %s", html.id);
                return null;
            }

            ret.postId = String(html.postId);

            if(html.externalHref) {
                ret.externals = _.map(html.externalHref, function(link) {
                    return {
                        link: link,
                        id: various.hash({
                            'href': link,
                            'type': "original"
                        })
                    };
                });
            }

            /* the timings are recorded in GTM, I want to display in Buenos Aires time */
            ret.impressionTime = moment(impression.impressionTime).utcOffset(-180).format();
            ret.publicationTime = moment(html.publicationUTime * 1000).utcOffset(-180).format();
            ret.visualizationDiff = moment
                .duration(
                    moment(impression.impressionTime).utcOffset(-180) -
                    moment(html.publicationUTime * 1000).utcOffset(-180)
                ).asSeconds();

            ret.reactions = html.rmap;
            ret.interactions = {
                total: html.rtotal,
                comments: html.comments,
                shares: html.shares
            };
            ret.displayName = html.source;

            return _.merge(ret, patternMap(html.html),
                _.pick(impression, ['impressionOrder' ]),
                _.pick(html, ['id', 'hrefType', 'timelineId' ])
            );
        });
    });
}

function appendPromise(fpath, str, reset=false) {
    var options = {
        encoding: 'utf8',
        mode: 0666,
        flag: 'a' 
    };
    if(reset) {
        debug("Opening and eventually overwritting '%s'", fpath);
        options.flag = "w";
    }
    return fs
        .writeFileAsync(fpath, str, options)
        .catch(function(error) { 
            debug("Error in %s: %s", fpath, error);
            return false;
        });
}

function beginQuery(user) {

    var filter = _.extend(timef, {
        startTime: {
            "$gt": new Date(timeFilter.start),
            "$lt": new Date(timeFilter.end) 
        },
        nonfeed: { "$exists": false },
        userId: _.parseInt(user.id)
    });
   
    return mongo
        .read(nconf.get('schema').timelines, filter, { startTime: -1 })
        .map(function(e, i) {
            e.name = user.name;
            return e;
        })
        .tap(function(r) {
            debug("¹ user %j contributed with %d timelines", user, _.size(r));
        })
        .map(lookintoHTMLs, { concurrency: 1 })
        .then(_.flatten)
        .tap(function(r) {
            debug("² user %j contributed with %d posts", user, _.size(r));
        });
};

return various
    .loadJSONfile("config/users.json")
    .then(function(c) {
        return c['silver'];
    })
    .map(beginQuery, { concurrency: 1})
    .then(_.flatten)
    .tap(function(c) {
        debug("All the posts are %d", _.size(c));
        /* saving the file, all the data are kept togheder */
        return appendPromise(destFile, JSON.stringify(c, undefined, 2), reset=true);
    })
    .tap(function(c) {
        debug("Done! %s saved", destFile);
    });
