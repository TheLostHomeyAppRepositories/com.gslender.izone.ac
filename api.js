module.exports = {
    async sendMessageAndReturnAddress({ homey })
    {
        return await homey.app.sendMessageAndReturnAddress();
    }
};