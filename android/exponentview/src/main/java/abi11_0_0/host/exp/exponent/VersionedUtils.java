// Copyright 2015-present 650 Industries. All rights reserved.

package abi11_0_0.host.exp.exponent;

import abi11_0_0.com.facebook.react.ReactInstanceManager;
import abi11_0_0.com.facebook.react.common.LifecycleState;
import abi11_0_0.com.facebook.react.shell.MainReactPackage;

import host.exp.exponent.experience.ExperienceActivity;
import host.exp.exponentview.Exponent;

public class VersionedUtils {

  public static ReactInstanceManager.Builder getReactInstanceManagerBuilder(Exponent.InstanceManagerBuilderProperties instanceManagerBuilderProperties) {
    ReactInstanceManager.Builder builder = ReactInstanceManager.builder()
        .setApplication(instanceManagerBuilderProperties.application)
        .setJSBundleFile(instanceManagerBuilderProperties.jsBundlePath)
        .addPackage(new MainReactPackage())
        .addPackage(new ExponentPackage(
                instanceManagerBuilderProperties.experienceProperties,
                instanceManagerBuilderProperties.manifest))
        .setInitialLifecycleState(LifecycleState.RESUMED);
    return builder;
  }

}
