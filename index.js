const config = require('./config');
const { onError } = require('./handlers');
const ProfileBot = require('./ProfileBot');

const init = {
    quiet: true,
    endpoints: [config.bot.endpoint],
    username: config.bot.username,
    password: config.bot.password
};

new ProfileBot(init).start().catch(onError);