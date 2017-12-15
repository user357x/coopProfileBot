const { questions, regions, times, statuses } = require('./data');

const getAbout = (extensions, isUpdate) => {
    const about = [
        `ФИО: ${extensions.surname} ${extensions.name} ${extensions.patronymic}`,
        `Дата рождения: ${extensions.birthday}`,
        `Регион: ${extensions.region}`,
        `Статус: ${extensions.status}`,
        `Ник: ${extensions.nik}`
    ].join('\n');

    const message = [
        isUpdate ? 'Исправлено!' : 'Спасибо, что уделили время.',
        'Ваш профиль:',
        about,
        'Если Вы допустили ошибку, в любое время напишите мне "Исправить"'
    ].join('\n');

    return [about, message];
};

exports.onMessage = (bot) => {

    return async ({peer, content}) => {

        if (peer.type !== 'user' || content.type !== 'text') {
            return;
        }

        const user = bot.users.get(peer.id);

        //console.log(typeof peer.id);

        if (!user) {
            return;
        }

        console.log();

        let currentQuestionId = bot.getNextQuestionId(user.extensions);

        console.log('currentQuestionId', currentQuestionId);
        console.log('user', user);
        console.log('content.text', content.text);

        let updateExtension = user.updateExtension;

        if(!currentQuestionId && content.text.toLowerCase() === 'исправить' && !updateExtension) {
            await bot.sendProfileMenu(peer.id);
            return;
        }
        else if (!currentQuestionId && !updateExtension) {
            return;
        }
        else if (!currentQuestionId && updateExtension) {
            currentQuestionId = updateExtension;
        }

        switch(currentQuestionId) {

            case 'birthday':
                if(!/^(0[1-9]|[12][0-9]|3[01])\.(0[1-9]|1[012])\.(19|20)\d\d$/.test(content.text)) {
                    await bot.sendTextMessage({ id: peer.id, type: 'user' }, questions[currentQuestionId].error);
                    return;
                }
                await bot.updateUserExtension(peer.id, currentQuestionId, content.text);
                updateExtension ? delete user.updateExtension : void 0;
                break;

            case 'region':
                await bot.sendRegionMenu(peer.id, questions.region.text);
                return;

            case 'status':
                await bot.sendStatusMenu(peer.id, questions.status.text);
                return;

            case 'nik':
                if(!/^\w{2,30}$/.test(content.text)) {
                    await bot.sendTextMessage({ id: peer.id, type: 'user' }, questions[currentQuestionId].error);
                    return;
                }
                await bot.updateUserExtension(peer.id, currentQuestionId, content.text);
                updateExtension ? delete user.updateExtension : void 0;
                break;

            default:
                await bot.updateUserExtension(peer.id, currentQuestionId, content.text);
                updateExtension ? delete user.updateExtension : void 0;
                break;
        }

        const nextQuestionId = bot.getNextQuestionId(user.extensions);

        console.log('nextQuestionId', nextQuestionId);

        if (nextQuestionId) {
            switch(nextQuestionId) {
                case 'region':
                    await bot.sendRegionMenu(peer.id, questions[nextQuestionId].text);
                    break;

                case 'status':
                    await bot.sendStatusMenu(peer.id, questions[nextQuestionId].text);
                    break;

                default:
                    await bot.sendTextMessage({ id: peer.id, type: 'user' }, questions[nextQuestionId].text);
                    break;
            }
        }
        else {
            const [about, message] = getAbout(user.extensions, updateExtension);

            await bot.updateUserAbout(peer.id, about);

            await bot.sendTextMessage({ id: peer.id, type: 'user' }, message);
        }
    }
};

exports.onInteractiveEvent = (bot) => {
    const handlers = {

        begin: {
            begin: async event => bot.sendNextQuestion(event.uid),
        },

        later: {
            later: async event => bot.sendTimeMenu(event.uid),
        },

        timeMenu: (() => {
            const timeMenuHandlers = {};
            Object.keys(times).forEach(time => timeMenuHandlers[time] = async event => {
                await bot.setTask(event.uid, parseInt(time));
                await bot.sendTextMessage({
                    id: event.uid,
                    type: 'user'
                }, times[time].answer);
            });
            return timeMenuHandlers;
        })(),

        regionMenu: (() => {
            const regionMenuHandlers = {};
            Object.keys(regions).forEach(number => regionMenuHandlers[number] = async (event) => {
                await bot.updateUserExtension(
                    event.uid,
                    'region',
                    regions[number]
                );
                let isUpdate;
                const user = bot.users.get(event.uid);
                if(isUpdate = user.updateExtension) {
                    delete user.updateExtension;
                    const [about, message] = getAbout(user.extensions, isUpdate);
                    await bot.updateUserAbout(event.uid, about);
                    await bot.sendTextMessage({ id: event.uid, type: 'user' }, message);
                }
                else {
                    await bot.sendNextQuestion(event.uid)
                }
            });
            return regionMenuHandlers;
        })(),

        statusMenu: (() => {
            const statusMenuHandlers = {};
            Object.keys(statuses).forEach(status => statusMenuHandlers[status] = async (event) => {
                await bot.updateUserExtension(
                    event.uid,
                    'status',
                    statuses[status].label
                );
                let isUpdate;
                const user = bot.users.get(event.uid);
                if(isUpdate = user.updateExtension) {
                    delete user.updateExtension;
                    const [about, message] = getAbout(user.extensions, isUpdate);
                    await bot.updateUserAbout(event.uid, about);
                    await bot.sendTextMessage({ id: event.uid, type: 'user' }, message);
                }
                else {
                    await bot.sendNextQuestion(event.uid)
                }
            });
            return statusMenuHandlers;
        })(),

        profileMenu: (() => {
            const profileMenuHandlers = {};
            Object.keys(questions).forEach(question => profileMenuHandlers[question] = async (event) => {

                bot.users.get(event.uid).updateExtension = question;

                switch(question) {
                    case 'region':
                        await bot.sendRegionMenu(event.uid, questions.region.shortText);
                        break;

                    case 'status':
                        await bot.sendStatusMenu(event.uid, questions.status.shortText);
                        break;

                    default:
                        await bot.sendTextMessage({ id: event.uid, type: 'user' }, questions[question].shortText);
                        break;
                }

            });
            return profileMenuHandlers;
        })()

    };

    return async (event) => await handlers[event.id][event.value](event);

};

exports.onError = error => {
    console.trace(error);
    console.error(error);
    process.exit(1);
};