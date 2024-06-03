module.exports = {
    async sendMessageAndReturnAddress({ homey })
    {
        const result = await homey.app.sendMessageAndReturnAddress();
        return result;
    }
};