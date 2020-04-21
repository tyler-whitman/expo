import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { connect } from 'react-redux';

import ListItem from '../components/ListItem';
import ScrollView from '../components/NavigationScrollView';
import SectionFooter from '../components/SectionFooter';
import SectionHeader from '../components/SectionHeader';
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
        <SectionHeader title="Theme" />
        <ListItem
          title="Automatic"
          checked={preferredAppearance === 'no-preference'}
          onPress={() => this._setPreferredAppearance('no-preference')}
        />
        <ListItem
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
        <SectionFooter
          title="Automatic is only supported on operating systems that allow you to control the
            system-wide color scheme."
        />
      </View>
    );
  }

  _renderSignOut() {
    return (
      <ListItem style={styles.marginTop} title="Sign Out" onPress={this._handlePressSignOut} last />
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
