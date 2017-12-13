
exports.onMessage = bot => {
    return async ({ peer, content }) => {
        if (peer.type !== 'user' || content.type !== 'text') {
            return;
        }

        const user = bot.users.get(peer.id);
        if (!user) {
            return;
        }

        const currentQuestion = bot.findCurrentQuestion(user);
        if (!currentQuestion) {
            return;
        }

        await bot.updateUserExtension(peer.id, currentQuestion.id, content.text);

        let message;

        const nextQuestion = bot.findCurrentQuestion(user);
        if (nextQuestion) {
            message = nextQuestion.text;
        }
        else {
            const about = [
                `ФИО: ${user.extensions.surname} ${user.extensions.name} ${user.extensions.patronymic}`,
                `Регион: ${user.extensions.region}`,
                `Работа: ${user.extensions.career} ${user.extensions.position}`
            ].join('\n');

            await bot.updateUserAbout(peer.id, about);

            message = [
                'Спасибо, что уделили время.',
                'Ваш профиль:',
                about
            ].join('\n');
        }

        await bot.sendTextMessage({ id: peer.id, type: 'user' }, message);
    }
};

exports.onEvent = bot => {
    return async (event) => {

        console.log(event);

        switch(event.value) {
            case 'begin':
                await bot.sendNextQuestion(event.uid);
                break;

            case 'later':
                await bot.sendTimeMenu(event.uid);
                break;

            case 'one_hour':
                await bot.setTask(event.uid, 1);
                await bot.sendTextMessage({ id: event.uid, type: 'user' }, `Хорошо, мы напомним вам через 1 час`);
                break;

            case 'three_hours':
                await bot.setTask(event.uid, 3);
                await bot.sendTextMessage({ id: event.uid, type: 'user' }, `Хорошо, мы напомним вам через 3 часа`);
                break;

            case 'seven_hours':
                await bot.setTask(event.uid, 7);
                await bot.sendTextMessage({ id: event.uid, type: 'user' }, `Хорошо, мы напомним вам через 7 часов`);
                break;

            case 'twenty_four_hours':
                await bot.setTask(event.uid, 24);
                await bot.sendTextMessage({ id: event.uid, type: 'user' }, `Хорошо, мы напомним вам через 24 часа`);
                break;
        }
    }
};

exports.onError = error => {
    console.trace(error);
    console.error(error);
};