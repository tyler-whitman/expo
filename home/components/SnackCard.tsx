import * as React from 'react';
import { Linking, Share } from 'react-native';
import { withNavigation } from 'react-navigation';

import UrlUtils from '../utils/UrlUtils';
import ListItem from './ListItem';

type Props = React.ComponentProps<typeof ListItem> & {
  projectName: string;
  description: string;
  projectUrl: string;
  slug: string;
};

function normalizeDescription(description: string) {
  return !description || description === 'No description' ? undefined : description;
}

@withNavigation
export default class SnackCard extends React.PureComponent<Props> {
  render() {
    const { description, projectName, projectUrl, slug, ...restProps } = this.props;

    return (
      <ListItem
        title={projectName}
        subtitle={normalizeDescription(description)}
        onLongPress={this._handleLongPressProject}
        onPress={this._handlePressProject}
        {...restProps}
      />
    );
  }

  _handlePressProject = () => {
    const url = UrlUtils.normalizeUrl(this.props.projectUrl);
    Linking.openURL(url);
  };

  _handleLongPressProject = () => {
    const url = UrlUtils.normalizeUrl(this.props.projectUrl);
    Share.share({
      title: this.props.projectName,
      message: url,
      url,
    });
  };
}
