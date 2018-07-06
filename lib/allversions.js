
var _ = require('lodash');

var apiListVersion1 = {
    /* POST from the userscript */
    processEvents:    require('./events').processEvents,
    getSelector:      require('./selector').getSelector,
    userInfo:         require('./selector').userInfo

};

module.exports = {
    implementations: apiListVersion1
};
