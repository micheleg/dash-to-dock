---
layout: main
title: 'Theming'
section: 'development'
order: 2
---


## Theming
The extension aims to be as **theme-friendly** as possible. The dock appearence is inherited from the default dash so basic theme support is always granted. However, some features has to be direclty supported by the theme. There are some [themes supporting the extension](./themes.html), the Adwaita-dashtodock in particular.

Adding support to a theme for the Dash to Dock extension is easy: the dash is put inside a container actor named <code>#dashtodockContainer</code> so the extended dash can be targeted without conflicting with the default dash. There are some additional css classes that theme writers can exploit in order to support the extension better:

 * `.running1`, <code>.running2</code>, <code>.running3</code>, <code>.running4</code>: like the default .running style but based on the number of windows of the application. The <code>.running4</code> class targets 4 and more windows. All classes are applied to the *app-well-app* actors.
 * `.focused`: applied to the <code>.app-well-app</code> actor of the currently focused application.
 * `.extended`: applied to the <code>#dashtodockContainer</code> actor when the dock height is extended to the whole vertical space.

Below is a css code snippet showing how the dock can be customized

{% highlight css lineos%}
/* Add Dash to Dock Support */

/* Shrink the dash by reducing padding and border radius */
#dashtodockContainer #dash {
    padding: 1px 0px;
    border-radius: 0px 6px 6px 0px;
}

#dashtodock #dash:rtl {
    border-radius: 6px 0px 0px 6px;
}

#dashtodockContainer .dash-item-container > StButton {
    transition-duration: 250;
    background-size: contain;
}

#dashtodockContainer .dash-item-container > StButton {
   padding: 1px 2px;
}

/* Dash height extended to the whole available vertical space */
#dashtodockContainer.extended #dash {
    border:0;
    border-radius: 0;
}

/* Running and focused application style */

#dashtodockContainer .app-well-app.running > .overview-icon {
background-image:none;
}

#dashtodockContainer .app-well-app.focused > .overview-icon {
    transition-duration: 250;
    background-gradient-start: rgba(255, 255, 255, .05);
    background-gradient-end: rgba(255, 255, 255, .15);
    background-gradient-direction: vertical;
    border-radius: 4px;
    box-shadow: inset 0px 1px 2px 0px rgba(0, 0, 0, 1);
}

#dashtodockContainer:ltr .running1 {
    background-image: url('one.svg');
}

#dashtodockContainer:rtl .running1 {
    background-image: url('one_rtl.svg');
}

#dashtodockContainer:ltr .running2 {
    background-image: url('two.svg');
}

#dashtodockContainer:rtl .running2 {
    background-image: url('two_rtl.svg');
}

#dashtodockContainer:ltr .running3 {
   background-image: url('three.svg');
}

#dashtodockContainer:rtl .running3 {
    background-image: url('three_rtl.svg');
}

#dashtodockContainer:ltr .running4 {
    background-image: url('four.svg');
}

#dashtodockContainer:rtl .running4 {
    background-image: url('four_rtl.svg');
}
{% endhighlight  %}

