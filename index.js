const config = require('./config');
const onError = require('./onError');
const ProfileBot = require('./ProfileBot');

const init = {
    quiet: true,
    endpoints: [config.bot.endpoint],
    username: config.bot.username,
    password: config.bot.password
};

//new ProfileBot(init).start().catch(onError);

const bot = new ProfileBot(init);
bot.start(init).catch(onError);

/*bot.onInteractiveEvent(async event => {

    console.log(event)
    if(event.value === 'later') {
        await this.sendTimeMenu(event.uid)
    }
    else if(event.value === 'begin') {

    }

});*/


/*
const { Bot } = require('@dlghq/dialog-bot-sdk');

const bot = new Bot(init);

bot.onMessage(async (peer, message) => {
    const uid = await bot.getUid();

    console.log(uid);

    if (message.content.type === 'text') {
        await bot.sendTextMessage(peer, message.content.text);
    }
});

bot.onError((error) => {
    console.error(error);
    process.exit(1);
});
*/