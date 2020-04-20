import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { connect } from 'react-redux';

import ListItem from '../components/ListItem';
import ListSection from '../components/ListSection';
import ScrollView from '../components/NavigationScrollView';
import SharedStyles from '../constants/SharedStyles';
import SessionActions from '../redux/SessionActions';
import SettingsActions from '../redux/SettingsActions';

type PreferredAppearance = 'light' | 'dark' | 'no-preference';

type Props = {
  preferredAppearance: PreferredAppearance;
};

@connect(data => UserSettingsScreen.getDataProps(data))
export default class UserSettingsScreen extends React.Component<Props> {
  static navigationOptions = {
    title: 'Options',
  };

  static getDataProps(data) {
    const { settings } = data;

    return {
      preferredAppearance: settings.preferredAppearance,
    };
  }

  render() {
    return (
      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag">
        {this._renderAppearanceOptions()}
        {this._renderSignOut()}
      </ScrollView>
    );
  }

  _handlePressSignOut = () => {
    this.props.dispatch(SessionActions.signOut());
    requestAnimationFrame(this.props.navigation.pop);
  };

  _setPreferredAppearance = (preferredAppearance: PreferredAppearance) => {
    this.props.dispatch(SettingsActions.setPreferredAppearance(preferredAppearance));
  };

  _renderAppearanceOptions() {
    const { preferredAppearance } = this.props;

    return (
      <View style={styles.marginTop}>
        <ListSection title="Theme" />
        <ListItem
          last={false}
          title="Automatic"
          checked={preferredAppearance === 'no-preference'}
          onPress={() => this._setPreferredAppearance('no-preference')}
        />
        <ListItem
          last={false}
          title="Light"
          checked={preferredAppearance === 'light'}
          onPress={() => this._setPreferredAppearance('light')}
        />
        <ListItem
          last
          margins={false}
          title="Dark"
          checked={preferredAppearance === 'dark'}
          onPress={() => this._setPreferredAppearance('dark')}
        />
        <View style={SharedStyles.genericCardDescriptionContainer}>
          <Text style={SharedStyles.genericCardDescriptionText}>
            Automatic is only supported on operating systems that allow you to control the
            system-wide color scheme.
          </Text>
        </View>
      </View>
    );
  }

  _renderSignOut() {
    return (
      <ListItem style={styles.marginTop} title="Sign Out" onPress={this._handlePressSignOut} />
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  marginTop: {
    marginTop: 25,
  },
});
