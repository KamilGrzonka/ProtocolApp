const createNetlifyHandler = ({ connectLambda, appHandler }) => async (event, context) => {
  if (event?.blobs) {
    connectLambda(event);
  }

  return appHandler(event, context);
};

module.exports = { createNetlifyHandler };
