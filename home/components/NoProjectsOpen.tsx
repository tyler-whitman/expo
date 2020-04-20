import * as React from 'react';

import ListItem from './ListItem';

type Props = {
  isAuthenticated: boolean;
};

export default class NoProjectsOpen extends React.Component<Props> {
  render() {
    const { isAuthenticated } = this.props;
    const message = isAuthenticated
      ? 'No projects are currently open.'
      : 'Sign in to your Expo account to see the projects you have recently been working on.';

    return <ListItem subtitle={message} last />;
  }
}
