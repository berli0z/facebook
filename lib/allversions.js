
var _ = require('lodash');

var apiListVersion1 = {
    /* POST from the userscript */
    processEvents:    require('./events').processEvents,
    getSelector:      require('./selector').getSelector,
    userInfo:         require('./selector').userInfo,

    /* POST on parser operations */
    snippetAvailable: require('./parser').snippetAvailable,
    snippetContent:   require('./parser').snippetContent,
    snippetResult:    require('./parser').snippetResult
};

module.exports = {
    implementations: apiListVersion1
};
