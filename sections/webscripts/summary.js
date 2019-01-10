function initializeSummary() {
    const token = _.find(window.location.pathname.split('/'), function(e) {
        return _.size(e) == 40;
    });
    const url = `${window.location.origin}/api/v1/summary/${token}`;
    $('#summary').html(`<a href="${url}">${url}</a>`);
};